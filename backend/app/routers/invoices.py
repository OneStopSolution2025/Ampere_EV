from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer, Invoice, Item, JobCard, Payment, Subdealer, User, Vehicle, VehicleUnit
from ..schemas import InvoiceIn, LineIn, PaymentIn
from ..security import MGMT, STAFF, require_roles
from ..services import (apply_invoice_effects, audit, build_lines, compute_lines, doc_prefix, get_business,
                        next_number, r2, refresh_status, reverse_invoice_effects)

router = APIRouter(prefix="/invoices", tags=["billing"])
prouter = APIRouter(prefix="/payments", tags=["billing"])

VIEWERS = STAFF + ("subdealer",)


def invoice_summary(i: Invoice) -> dict:
    return {
        "id": i.id, "doc_type": i.doc_type, "category": i.category, "number": i.number, "date": i.date.isoformat(),
        "customer_id": i.customer_id, "subdealer_id": i.subdealer_id,
        "customer_name": i.party_name, "customer_phone": i.party_phone, "is_subdealer": bool(i.subdealer_id),
        "vehicle_reg": (i.vehicle.reg_no or i.vehicle.vin) if i.vehicle else None, "total": i.total, "paid": i.paid,
        "balance": r2(i.total - i.paid) if i.doc_type == "invoice" and i.status != "cancelled" else 0,
        "status": i.status,
    }


def party_out(i: Invoice) -> dict:
    p = i.subdealer or i.customer
    return {"id": p.id, "name": p.name, "phone": p.phone, "email": p.email, "address": p.address, "gstin": p.gstin,
            "state": p.state, "is_subdealer": bool(i.subdealer_id)}


def invoice_out(db: Session, i: Invoice) -> dict:
    biz = get_business(db)
    v = i.vehicle
    units = {u.id: u for u in db.scalars(select(VehicleUnit).where(
        VehicleUnit.id.in_([l.vehicle_unit_id for l in i.lines if l.vehicle_unit_id])))}
    out = invoice_summary(i)
    out.update({
        "jobcard_id": i.jobcard_id, "odometer": i.odometer, "is_interstate": i.is_interstate,
        "subtotal": i.subtotal, "discount": i.discount, "taxable": i.taxable, "cgst": i.cgst, "sgst": i.sgst,
        "igst": i.igst, "round_off": i.round_off, "notes": i.notes, "converted_to_id": i.converted_to_id,
        "created_at": i.created_at.isoformat(), "customer": party_out(i),
        "vehicle": {"id": v.id, "reg_no": v.reg_no, "make": v.make, "model": v.model, "variant": v.variant,
                    "color": v.color, "fuel_type": v.fuel_type, "year": v.year, "vin": v.vin,
                    "battery_no": v.battery_no} if v and i.category != "vehicle" else None,
        "lines": [{
            "id": l.id, "item_id": l.item_id, "vehicle_unit_id": l.vehicle_unit_id, "kind": l.kind,
            "description": l.description, "hsn_sac": l.hsn_sac, "qty": l.qty, "unit_price": l.unit_price,
            "discount": l.discount, "gst_rate": l.gst_rate, "taxable": l.taxable, "tax": l.tax, "total": l.total,
            "unit": {k: getattr(units[l.vehicle_unit_id], k) for k in
                     ("chassis_no", "motor_no", "battery_no", "charger_no", "color", "mfg_year")}
            if l.vehicle_unit_id in units else None,
        } for l in i.lines],
        "payments": [{"id": p.id, "amount": p.amount, "mode": p.mode, "reference": p.reference,
                      "date": p.date.isoformat()} for p in i.payments],
        "business": {k: getattr(biz, k) for k in ("name", "tagline", "gstin", "phone", "email", "address", "state",
                                                    "state_code", "upi_id", "bank_details", "terms")},
    })
    return out


def resolve_party(db: Session, data: InvoiceIn):
    customer = subdealer = vehicle = None
    if data.subdealer_id:
        subdealer = db.get(Subdealer, data.subdealer_id)
        if not subdealer or not subdealer.is_active:
            raise HTTPException(400, "Select an active sub-dealer")
    else:
        customer = db.get(Customer, data.customer_id)
        if not customer:
            raise HTTPException(404, "Customer not found")
    if data.vehicle_id:
        vehicle = db.get(Vehicle, data.vehicle_id)
        if not vehicle or not customer or vehicle.customer_id != customer.id:
            raise HTTPException(400, "Vehicle does not belong to this customer")
    if data.category == "service" and not vehicle:
        raise HTTPException(400, "Select the customer's vehicle for a service bill")
    return customer, subdealer, vehicle


def resolve_interstate(db: Session, party, explicit: bool | None) -> bool:
    if explicit is not None:
        return explicit
    biz = get_business(db)
    if party and party.state and biz.state:
        return party.state.strip().lower() != biz.state.strip().lower()
    return False


def check_vehicle_lines(db: Session, data: InvoiceIn):
    for l in data.items:
        if l.kind != "vehicle" or not l.vehicle_unit_id:
            continue
        unit = db.get(VehicleUnit, l.vehicle_unit_id)
        if not unit:
            raise HTTPException(400, "Vehicle not found in stock")
        l.item_id = unit.item_id
        if not l.hsn_sac:
            l.hsn_sac = unit.item.hsn_sac


def add_payment(db: Session, inv: Invoice, data: PaymentIn, user: User):
    if inv.doc_type != "invoice" or inv.status == "cancelled":
        raise HTTPException(400, "Payments can only be recorded against active invoices")
    balance = r2(inv.total - sum(p.amount for p in inv.payments))
    if data.amount > balance + 0.009:
        raise HTTPException(400, f"Amount exceeds balance due ({balance:.2f})")
    inv.payments.append(Payment(amount=r2(data.amount), mode=data.mode, reference=data.reference,
                                date=data.date or date.today(), received_by=user.id))
    refresh_status(inv)


def check_credit(db: Session, subdealer: Subdealer | None, new_amount: float, user: User):
    if not subdealer or not subdealer.credit_limit or user.role == "admin":
        return  # admin may override credit limits
    due = db.scalar(select(func.coalesce(func.sum(Invoice.total - Invoice.paid), 0)).where(
        Invoice.subdealer_id == subdealer.id, Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial"))))
    if due + new_amount > subdealer.credit_limit + 0.01:
        raise HTTPException(400, f"Exceeds {subdealer.name}'s credit limit (outstanding ₹{due:,.0f}, limit "
                                 f"₹{subdealer.credit_limit:,.0f}). Ask an administrator to approve.")


def create_document(db: Session, data: InvoiceIn, user: User) -> Invoice:
    customer, subdealer, vehicle = resolve_party(db, data)
    check_vehicle_lines(db, data)
    biz = get_business(db)
    doc_date = data.date or date.today()
    interstate = resolve_interstate(db, subdealer or customer, data.is_interstate)
    lines, totals = compute_lines(data.items, interstate)
    if data.doc_type == "invoice":
        check_credit(db, subdealer, totals["total"] - (data.payment.amount if data.payment else 0), user)
    inv = Invoice(doc_type=data.doc_type, category=data.category,
                  number=next_number(db, doc_prefix(biz, data.doc_type, data.category), doc_date), date=doc_date,
                  customer_id=customer.id if customer else None, subdealer_id=subdealer.id if subdealer else None,
                  vehicle_id=vehicle.id if vehicle else None, jobcard_id=data.jobcard_id, odometer=data.odometer,
                  is_interstate=interstate, notes=data.notes, created_by=user.id,
                  status="unpaid" if data.doc_type == "invoice" else "open", **totals)
    build_lines(inv, lines)
    db.add(inv)
    db.flush()
    apply_invoice_effects(db, inv, user)
    if data.jobcard_id and data.doc_type == "invoice":
        jc = db.get(JobCard, data.jobcard_id)
        if jc:
            jc.status, jc.invoice_id = "invoiced", inv.id
    if data.payment and data.doc_type == "invoice":
        add_payment(db, inv, data.payment, user)
    audit(db, user, "create", "invoice", inv.id, f"{inv.number} · {inv.party_name} · ₹{inv.total:,.2f}")
    return inv


def load_visible(db: Session, iid: int, user: User) -> Invoice:
    inv = db.get(Invoice, iid)
    if not inv or (user.role == "subdealer" and inv.subdealer_id != user.subdealer_id):
        raise HTTPException(404, "Document not found")
    return inv


@router.get("/summary")
def summary(category: str = "", db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    today = date.today()
    ms = today.replace(day=1)
    base = [Invoice.doc_type == "invoice", Invoice.status != "cancelled"]
    if category:
        base.append(Invoice.category == category)

    def agg(*extra):
        return db.execute(select(func.count(), func.coalesce(func.sum(Invoice.total), 0)).where(*base, *extra)).one()
    t, m = agg(Invoice.date == today), agg(Invoice.date >= ms)
    due = db.execute(select(func.count(), func.coalesce(func.sum(Invoice.total - Invoice.paid), 0)).where(
        *base, Invoice.status.in_(("unpaid", "partial")))).one()
    est = db.scalar(select(func.count()).select_from(Invoice).where(
        Invoice.doc_type == "estimate", Invoice.status == "open", *( [Invoice.category == category] if category else [])))
    return {"today_count": t[0], "today_total": r2(t[1]), "month_count": m[0], "month_total": r2(m[1]),
            "due_count": due[0], "due_total": r2(due[1]), "open_estimates": est}


@router.get("")
def list_invoices(doc_type: str = "invoice", category: str = "", status: str = "", q: str = "",
                  subdealer_id: int | None = None, date_from: date | None = None, date_to: date | None = None,
                  limit: int = 50, offset: int = 0, db: Session = Depends(get_db),
                  user: User = Depends(require_roles(*VIEWERS))):
    stmt = (select(Invoice).outerjoin(Customer, Invoice.customer_id == Customer.id)
            .outerjoin(Subdealer, Invoice.subdealer_id == Subdealer.id)
            .outerjoin(Vehicle, Invoice.vehicle_id == Vehicle.id))
    if user.role == "subdealer":
        stmt = stmt.where(Invoice.subdealer_id == user.subdealer_id)
    elif subdealer_id:
        stmt = stmt.where(Invoice.subdealer_id == subdealer_id)
    if doc_type:
        stmt = stmt.where(Invoice.doc_type == doc_type)
    if category:
        stmt = stmt.where(Invoice.category == category)
    if status == "due":
        stmt = stmt.where(Invoice.status.in_(("unpaid", "partial")))
    elif status:
        stmt = stmt.where(Invoice.status == status)
    if q:
        like = f"%{q.strip()}%"
        key = f"%{''.join(q.upper().split())}%"
        stmt = stmt.where(or_(Invoice.number.ilike(like), Customer.name.ilike(like), Customer.phone.ilike(like),
                              Subdealer.name.ilike(like), Vehicle.reg_no.ilike(key), Vehicle.vin.ilike(key)))
    if date_from:
        stmt = stmt.where(Invoice.date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.date <= date_to)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Invoice.date.desc(), Invoice.id.desc()).offset(offset).limit(min(limit, 200)))
    return {"total": total, "items": [invoice_summary(i) for i in rows]}


@router.post("", status_code=201)
def create_invoice(data: InvoiceIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF))):
    inv = create_document(db, data, user)
    db.commit()
    return invoice_out(db, inv)


@router.get("/{iid}")
def get_invoice(iid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*VIEWERS))):
    return invoice_out(db, load_visible(db, iid, user))


@router.put("/{iid}")
def update_invoice(iid: int, data: InvoiceIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(*STAFF))):
    inv = db.get(Invoice, iid)
    if not inv:
        raise HTTPException(404, "Document not found")
    if inv.status in ("cancelled", "converted"):
        raise HTTPException(400, "This document can no longer be edited")
    if inv.doc_type == "invoice" and inv.payments and user.role != "admin":
        raise HTTPException(403, "Invoices with payments can only be edited by an administrator")
    if data.category != inv.category or data.doc_type != inv.doc_type:
        raise HTTPException(400, "Bill type cannot be changed. Cancel and create a new bill instead.")
    customer, subdealer, vehicle = resolve_party(db, data)
    check_vehicle_lines(db, data)
    old_total = inv.total
    reverse_invoice_effects(db, inv, user, "edit-reversal")
    interstate = resolve_interstate(db, subdealer or customer, data.is_interstate)
    lines, totals = compute_lines(data.items, interstate)
    if inv.paid > totals["total"] + 0.009:
        raise HTTPException(400, "New total is less than the amount already paid. Remove payments first.")
    inv.date = data.date or inv.date
    inv.customer_id = customer.id if customer else None
    inv.subdealer_id = subdealer.id if subdealer else None
    inv.vehicle_id = vehicle.id if vehicle else (inv.vehicle_id if inv.category == "vehicle" else None)
    inv.odometer, inv.notes, inv.is_interstate = data.odometer, data.notes, interstate
    for k, v in totals.items():
        setattr(inv, k, v)
    build_lines(inv, lines)
    db.flush()
    db.refresh(inv)
    apply_invoice_effects(db, inv, user)
    refresh_status(inv)
    audit(db, user, "update", "invoice", inv.id, f"{inv.number}: ₹{old_total:,.2f} → ₹{inv.total:,.2f}")
    db.commit()
    db.refresh(inv)
    return invoice_out(db, inv)


@router.post("/{iid}/cancel")
def cancel_invoice(iid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    inv = db.get(Invoice, iid)
    if not inv:
        raise HTTPException(404, "Document not found")
    if inv.status == "cancelled":
        raise HTTPException(400, "Already cancelled")
    if inv.payments:
        raise HTTPException(400, "Remove recorded payments before cancelling this invoice")
    reverse_invoice_effects(db, inv, user, "cancel")
    inv.status = "cancelled"
    if inv.jobcard_id and inv.doc_type == "invoice":
        jc = db.get(JobCard, inv.jobcard_id)
        if jc and jc.invoice_id == inv.id:
            jc.status, jc.invoice_id = "completed", None
    audit(db, user, "cancel", "invoice", inv.id, f"{inv.number} · ₹{inv.total:,.2f}")
    db.commit()
    return invoice_out(db, inv)


@router.post("/{iid}/convert", status_code=201)
def convert_estimate(iid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF))):
    est = db.get(Invoice, iid)
    if not est or est.doc_type != "estimate":
        raise HTTPException(404, "Estimate not found")
    if est.status != "open":
        raise HTTPException(400, "Only open estimates can be converted")
    if any(l.kind == "vehicle" and not l.vehicle_unit_id for l in est.lines):
        raise HTTPException(400, "Edit the estimate and pick a chassis number for each vehicle first")
    data = InvoiceIn(
        doc_type="invoice", category=est.category, customer_id=est.customer_id, subdealer_id=est.subdealer_id,
        vehicle_id=est.vehicle_id if est.category != "vehicle" else None, jobcard_id=est.jobcard_id,
        odometer=est.odometer, is_interstate=est.is_interstate, notes=est.notes,
        items=[LineIn(item_id=l.item_id, vehicle_unit_id=l.vehicle_unit_id, kind=l.kind, description=l.description,
                      hsn_sac=l.hsn_sac, qty=l.qty, unit_price=l.unit_price, discount=l.discount,
                      gst_rate=l.gst_rate) for l in est.lines],
    )
    inv = create_document(db, data, user)
    est.status, est.converted_to_id = "converted", inv.id
    db.commit()
    return invoice_out(db, inv)


@router.post("/{iid}/payments", status_code=201)
def record_payment(iid: int, data: PaymentIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(*STAFF))):
    inv = db.get(Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    add_payment(db, inv, data, user)
    audit(db, user, "payment", "invoice", inv.id, f"{inv.number}: ₹{data.amount:,.2f} by {data.mode}")
    db.commit()
    return invoice_out(db, inv)


@prouter.delete("/{pid}")
def delete_payment(pid: int, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    p = db.get(Payment, pid)
    if not p:
        raise HTTPException(404, "Payment not found")
    inv = db.get(Invoice, p.invoice_id)
    inv.payments.remove(p)
    db.flush()
    refresh_status(inv)
    audit(db, user, "delete-payment", "invoice", inv.id, f"{inv.number}: ₹{p.amount:,.2f} {p.mode}")
    db.commit()
    return invoice_out(db, inv)


@router.get("/units/available")
def available_units(q: str = "", item_id: int | None = None, db: Session = Depends(get_db),
                    _=Depends(require_roles(*STAFF))):
    """Showroom vehicles that can be billed."""
    stmt = select(VehicleUnit).join(Item).where(VehicleUnit.status == "in_stock")
    if item_id:
        stmt = stmt.where(VehicleUnit.item_id == item_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(VehicleUnit.chassis_no.ilike(like), VehicleUnit.color.ilike(like), Item.name.ilike(like),
                              VehicleUnit.battery_no.ilike(like)))
    return [{"id": u.id, "item_id": u.item_id, "model": u.item.name, "price": u.item.price,
             "gst_rate": u.item.gst_rate, "hsn_sac": u.item.hsn_sac, "chassis_no": u.chassis_no,
             "motor_no": u.motor_no, "battery_no": u.battery_no, "color": u.color, "mfg_year": u.mfg_year}
            for u in db.scalars(stmt.order_by(VehicleUnit.received_on, VehicleUnit.id).limit(30))]
