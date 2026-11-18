from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Invoice, Payment, Subdealer, User, VehicleUnit
from ..schemas import SubdealerIn
from ..security import MGMT, STAFF, require_roles
from ..services import audit, r2

router = APIRouter(prefix="/subdealers", tags=["sub-dealers"])


def stats(db: Session, sid: int) -> dict:
    ms = date.today().replace(day=1)
    due = db.scalar(select(func.coalesce(func.sum(Invoice.total - Invoice.paid), 0)).where(
        Invoice.subdealer_id == sid, Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial"))))
    billed = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(
        Invoice.subdealer_id == sid, Invoice.doc_type == "invoice", Invoice.status != "cancelled"))
    month = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(
        Invoice.subdealer_id == sid, Invoice.doc_type == "invoice", Invoice.status != "cancelled", Invoice.date >= ms))
    holding = db.scalar(select(func.count()).select_from(VehicleUnit).where(
        VehicleUnit.subdealer_id == sid, VehicleUnit.status == "with_subdealer"))
    retailed = db.scalar(select(func.count()).select_from(VehicleUnit).where(
        VehicleUnit.subdealer_id == sid, VehicleUnit.status == "sold", VehicleUnit.sold_on >= ms))
    oldest = db.scalar(select(func.min(Invoice.date)).where(
        Invoice.subdealer_id == sid, Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial"))))
    return {"outstanding": r2(due), "lifetime_billed": r2(billed), "month_billed": r2(month),
            "vehicles_holding": holding, "retailed_this_month": retailed,
            "oldest_due_days": (date.today() - oldest).days if oldest else 0}


def sd_out(db: Session, s: Subdealer) -> dict:
    out = {k: getattr(s, k) for k in ("id", "name", "contact_person", "phone", "email", "gstin", "state", "address",
                                       "credit_limit", "is_active")}
    out.update(stats(db, s.id))
    out["credit_available"] = r2(s.credit_limit - out["outstanding"]) if s.credit_limit else None
    out["logins"] = [{"id": u.id, "name": u.name, "email": u.email, "is_active": u.is_active}
                     for u in db.scalars(select(User).where(User.subdealer_id == s.id))]
    return out


@router.get("")
def list_subdealers(q: str = "", include_inactive: bool = False, db: Session = Depends(get_db),
                    _=Depends(require_roles(*STAFF))):
    stmt = select(Subdealer).order_by(Subdealer.name)
    if not include_inactive:
        stmt = stmt.where(Subdealer.is_active.is_(True))
    if q:
        stmt = stmt.where(or_(Subdealer.name.ilike(f"%{q}%"), Subdealer.phone.ilike(f"%{q}%"),
                              Subdealer.contact_person.ilike(f"%{q}%")))
    return [sd_out(db, s) for s in db.scalars(stmt)]


@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    ms = date.today().replace(day=1)
    active = db.scalar(select(func.count()).select_from(Subdealer).where(Subdealer.is_active.is_(True)))
    due = db.scalar(select(func.coalesce(func.sum(Invoice.total - Invoice.paid), 0)).where(
        Invoice.subdealer_id.is_not(None), Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial"))))
    month = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(
        Invoice.subdealer_id.is_not(None), Invoice.doc_type == "invoice", Invoice.status != "cancelled",
        Invoice.date >= ms))
    holding = db.scalar(select(func.count()).select_from(VehicleUnit).where(VehicleUnit.status == "with_subdealer"))
    return {"active": active, "outstanding": r2(due), "month_billed": r2(month), "vehicles_holding": holding}


@router.post("", status_code=201)
def create_subdealer(data: SubdealerIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    s = Subdealer(**data.model_dump())
    s.gstin = s.gstin.upper() if s.gstin else None
    db.add(s)
    db.flush()
    audit(db, user, "create", "subdealer", s.id, s.name)
    db.commit()
    return sd_out(db, s)


def visible(db: Session, sid: int, user: User) -> Subdealer:
    s = db.get(Subdealer, sid)
    if not s or (user.role == "subdealer" and user.subdealer_id != sid):
        raise HTTPException(404, "Sub-dealer not found")
    return s


@router.get("/{sid}")
def get_subdealer(sid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF, "subdealer"))):
    return sd_out(db, visible(db, sid, user))


@router.get("/{sid}/ledger")
def ledger(sid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF, "subdealer"))):
    """Running account statement: invoices (debit) and payments (credit)."""
    visible(db, sid, user)
    entries = []
    for i in db.scalars(select(Invoice).where(Invoice.subdealer_id == sid, Invoice.doc_type == "invoice",
                                              Invoice.status != "cancelled")):
        entries.append({"date": i.date, "type": "invoice", "ref": i.number, "invoice_id": i.id,
                        "detail": i.category.title(), "debit": i.total, "credit": 0, "order": i.id * 2})
    for p in db.scalars(select(Payment).join(Invoice).where(Invoice.subdealer_id == sid,
                                                            Invoice.status != "cancelled")):
        entries.append({"date": p.date, "type": "payment", "ref": p.reference or p.mode.upper(),
                        "invoice_id": p.invoice_id, "detail": f"{p.mode.upper()} against invoice", "debit": 0,
                        "credit": p.amount, "order": p.invoice_id * 2 + 1})
    entries.sort(key=lambda e: (e["date"], e["order"]))
    bal = 0.0
    for e in entries:
        bal = r2(bal + e["debit"] - e["credit"])
        e["balance"] = bal
        e["date"] = e["date"].isoformat()
        e.pop("order")
    return {"entries": entries, "closing_balance": bal}


@router.put("/{sid}")
def update_subdealer(sid: int, data: SubdealerIn, db: Session = Depends(get_db),
                     user: User = Depends(require_roles(*MGMT))):
    s = db.get(Subdealer, sid)
    if not s:
        raise HTTPException(404, "Sub-dealer not found")
    if data.credit_limit != s.credit_limit and user.role != "admin":
        raise HTTPException(403, "Only an administrator can change credit limits")
    old_limit = s.credit_limit
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    s.gstin = s.gstin.upper() if s.gstin else None
    audit(db, user, "update", "subdealer", s.id,
          s.name + (f" · credit ₹{old_limit:,.0f} → ₹{s.credit_limit:,.0f}" if old_limit != s.credit_limit else ""))
    db.commit()
    return sd_out(db, s)
