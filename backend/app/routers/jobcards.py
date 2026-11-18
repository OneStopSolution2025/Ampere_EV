from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer, JobCard, JobCardItem, User, Vehicle
from ..schemas import InvoiceIn, JobCardIn, JobCardWorkIn, LineIn, PaymentIn, StatusIn
from ..security import ALL, MGMT, STAFF, require_roles
from ..services import audit, compute_lines, get_business, next_number
from .invoices import create_document, invoice_out

router = APIRouter(prefix="/jobcards", tags=["job cards"])

TRANSITIONS = {
    "open": {"in_progress", "completed", "cancelled"},
    "in_progress": {"open", "completed", "cancelled"},
    "completed": {"in_progress"},
    "invoiced": set(),
    "cancelled": {"open"},
}


def jobcard_out(j: JobCard, detail: bool = False) -> dict:
    _, totals = compute_lines(j.items, False)
    out = {
        "id": j.id, "number": j.number, "status": j.status, "customer_id": j.customer_id,
        "customer_name": j.customer.name, "customer_phone": j.customer.phone, "vehicle_id": j.vehicle_id,
        "vehicle_reg": j.vehicle.reg_no or j.vehicle.vin,
        "vehicle_name": " ".join(x for x in (j.vehicle.make, j.vehicle.model) if x),
        "technician_id": j.technician_id, "technician_name": j.technician.name if j.technician else None,
        "estimated_delivery": j.estimated_delivery.isoformat() if j.estimated_delivery else None,
        "invoice_id": j.invoice_id, "created_at": j.created_at.isoformat(), "updated_at": j.updated_at.isoformat(),
        "estimate_total": totals["total"],
    }
    if detail:
        out.update({
            "odometer": j.odometer, "fuel_level": j.fuel_level, "complaints": j.complaints, "diagnosis": j.diagnosis,
            "items": [{"id": i.id, "item_id": i.item_id, "kind": i.kind, "description": i.description,
                       "hsn_sac": i.hsn_sac, "qty": i.qty, "unit_price": i.unit_price, "gst_rate": i.gst_rate}
                      for i in j.items],
        })
    return out


def load(db: Session, jid: int, user: User) -> JobCard:
    j = db.get(JobCard, jid)
    if not j:
        raise HTTPException(404, "Job card not found")
    if user.role == "technician" and j.technician_id != user.id:
        raise HTTPException(403, "This job card is not assigned to you")
    return j


def set_items(j: JobCard, items: list[LineIn]):
    j.items.clear()
    for i in items:
        j.items.append(JobCardItem(item_id=i.item_id, kind=i.kind, description=i.description, hsn_sac=i.hsn_sac,
                                   qty=i.qty, unit_price=i.unit_price, gst_rate=i.gst_rate))


def check_technician(db: Session, tid: int | None):
    if tid:
        t = db.get(User, tid)
        if not t or t.role != "technician" or not t.is_active:
            raise HTTPException(400, "Select an active technician")


@router.get("")
def list_jobcards(status: str = "", q: str = "", limit: int = 50, offset: int = 0, db: Session = Depends(get_db),
                  user: User = Depends(require_roles(*ALL))):
    stmt = select(JobCard).join(Customer).join(Vehicle, JobCard.vehicle_id == Vehicle.id)
    if user.role == "technician":
        stmt = stmt.where(JobCard.technician_id == user.id)
    if status == "active":
        stmt = stmt.where(JobCard.status.in_(("open", "in_progress")))
    elif status:
        stmt = stmt.where(JobCard.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(JobCard.number.ilike(like), Customer.name.ilike(like), Customer.phone.ilike(like),
                              Vehicle.reg_no.ilike(f"%{''.join(q.upper().split())}%"),
                              Vehicle.vin.ilike(f"%{''.join(q.upper().split())}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(JobCard.id.desc()).offset(offset).limit(min(limit, 200)))
    return {"total": total, "items": [jobcard_out(j) for j in rows]}


@router.post("", status_code=201)
def create_jobcard(data: JobCardIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF))):
    v = db.get(Vehicle, data.vehicle_id)
    if not v or v.customer_id != data.customer_id:
        raise HTTPException(400, "Vehicle does not belong to this customer")
    check_technician(db, data.technician_id)
    biz = get_business(db)
    j = JobCard(number=next_number(db, biz.jobcard_prefix), created_by=user.id,
                **data.model_dump(exclude={"items"}))
    set_items(j, data.items)
    if data.odometer:
        v.odometer = data.odometer
    db.add(j)
    db.flush()
    audit(db, user, "create", "jobcard", j.id, f"{j.number} · {v.reg_no or v.vin}")
    db.commit()
    return jobcard_out(j, True)


@router.get("/{jid}")
def get_jobcard(jid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*ALL))):
    return jobcard_out(load(db, jid, user), True)


@router.put("/{jid}")
def update_jobcard(jid: int, data: JobCardIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(*STAFF))):
    j = load(db, jid, user)
    if j.status in ("invoiced", "cancelled"):
        raise HTTPException(400, "This job card can no longer be edited")
    v = db.get(Vehicle, data.vehicle_id)
    if not v or v.customer_id != data.customer_id:
        raise HTTPException(400, "Vehicle does not belong to this customer")
    check_technician(db, data.technician_id)
    for k, val in data.model_dump(exclude={"items"}).items():
        setattr(j, k, val)
    set_items(j, data.items)
    db.commit()
    return jobcard_out(j, True)


@router.patch("/{jid}/work")
def update_work(jid: int, data: JobCardWorkIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles(*ALL))):
    """Technicians record diagnosis and parts/labour used."""
    j = load(db, jid, user)
    if j.status in ("invoiced", "cancelled", "completed") and user.role == "technician":
        raise HTTPException(400, "Job card is closed for edits")
    if data.diagnosis is not None:
        j.diagnosis = data.diagnosis
    if data.items is not None:
        set_items(j, data.items)
    db.commit()
    return jobcard_out(j, True)


@router.patch("/{jid}/status")
def update_status(jid: int, data: StatusIn, db: Session = Depends(get_db),
                  user: User = Depends(require_roles(*ALL))):
    j = load(db, jid, user)
    if data.status not in TRANSITIONS.get(j.status, set()):
        raise HTTPException(400, f"Cannot move from {j.status.replace('_', ' ')} to {data.status.replace('_', ' ')}")
    if user.role == "technician" and data.status == "cancelled":
        raise HTTPException(403, "Only staff can cancel a job card")
    old = j.status
    j.status = data.status
    audit(db, user, "status", "jobcard", j.id, f"{j.number}: {old} → {data.status}")
    db.commit()
    return jobcard_out(j, True)


@router.post("/{jid}/invoice", status_code=201)
def jobcard_to_invoice(jid: int, payment: PaymentIn | None = None, db: Session = Depends(get_db),
                       user: User = Depends(require_roles(*STAFF))):
    j = load(db, jid, user)
    if j.status == "invoiced":
        raise HTTPException(400, "This job card is already billed")
    if j.status == "cancelled":
        raise HTTPException(400, "Cancelled job cards cannot be billed")
    if not j.items:
        raise HTTPException(400, "Add parts or labour to the job card before billing")
    data = InvoiceIn(
        doc_type="invoice", category="service", customer_id=j.customer_id, vehicle_id=j.vehicle_id, jobcard_id=j.id,
        odometer=j.odometer, notes=f"Job card {j.number}",
        items=[LineIn(item_id=i.item_id, kind=i.kind, description=i.description, hsn_sac=i.hsn_sac, qty=i.qty,
                      unit_price=i.unit_price, gst_rate=i.gst_rate) for i in j.items],
        payment=payment,
    )
    inv = create_document(db, data, user)
    db.commit()
    return invoice_out(db, inv)


@router.delete("/{jid}", status_code=204)
def delete_jobcard(jid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    j = load(db, jid, user)
    if j.status == "invoiced":
        raise HTTPException(400, "Billed job cards cannot be deleted")
    audit(db, user, "delete", "jobcard", j.id, j.number)
    db.delete(j)
    db.commit()
