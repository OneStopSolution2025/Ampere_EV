from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Item, Purchase, PurchaseLine, Supplier, SupplierPayment, User, VehicleUnit
from ..schemas import PaymentIn, PurchaseIn, SupplierIn
from ..security import MGMT, require_roles
from ..services import (adjust_part, audit, compute_lines, get_business, next_number, r2, recount_vehicle_stock,
                        refresh_status)

router = APIRouter(prefix="/purchases", tags=["purchases"])
srouter = APIRouter(prefix="/suppliers", tags=["purchases"])


def supplier_out(s: Supplier, due: float = 0) -> dict:
    return {"id": s.id, "name": s.name, "phone": s.phone, "email": s.email, "gstin": s.gstin, "state": s.state,
            "address": s.address, "payable": r2(due)}


def purchase_summary(p: Purchase) -> dict:
    return {"id": p.id, "number": p.number, "date": p.date.isoformat(), "supplier_id": p.supplier_id,
            "supplier_name": p.supplier.name, "supplier_invoice_no": p.supplier_invoice_no, "total": p.total,
            "paid": p.paid, "balance": r2(p.total - p.paid) if p.status != "cancelled" else 0, "status": p.status,
            "vehicles": sum(int(l.qty) for l in p.lines if l.kind == "vehicle"),
            "parts": r2(sum(l.qty for l in p.lines if l.kind == "part"))}


def purchase_out(db: Session, p: Purchase) -> dict:
    out = purchase_summary(p)
    units = db.scalars(select(VehicleUnit).where(VehicleUnit.purchase_id == p.id).order_by(VehicleUnit.id)).all()
    out.update({
        "supplier": supplier_out(p.supplier), "is_interstate": p.is_interstate, "subtotal": p.subtotal,
        "discount": p.discount, "taxable": p.taxable, "cgst": p.cgst, "sgst": p.sgst, "igst": p.igst,
        "round_off": p.round_off, "notes": p.notes, "created_at": p.created_at.isoformat(),
        "lines": [{"id": l.id, "item_id": l.item_id, "kind": l.kind, "description": l.description,
                   "hsn_sac": l.hsn_sac, "qty": l.qty, "unit_price": l.unit_price, "discount": l.discount,
                   "gst_rate": l.gst_rate, "taxable": l.taxable, "tax": l.tax, "total": l.total} for l in p.lines],
        "units": [{"id": u.id, "model": u.item.name, "chassis_no": u.chassis_no, "motor_no": u.motor_no,
                   "battery_no": u.battery_no, "charger_no": u.charger_no, "color": u.color, "status": u.status}
                  for u in units],
        "payments": [{"id": x.id, "amount": x.amount, "mode": x.mode, "reference": x.reference,
                      "date": x.date.isoformat()} for x in p.payments],
    })
    return out


# ---------- Suppliers ----------
@srouter.get("")
def list_suppliers(q: str = "", db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    stmt = select(Supplier).order_by(Supplier.name)
    if q:
        stmt = stmt.where(or_(Supplier.name.ilike(f"%{q}%"), Supplier.phone.ilike(f"%{q}%")))
    dues = dict(db.execute(select(Purchase.supplier_id, func.sum(Purchase.total - Purchase.paid)).where(
        Purchase.status.in_(("unpaid", "partial"))).group_by(Purchase.supplier_id)).all())
    return [supplier_out(s, dues.get(s.id, 0)) for s in db.scalars(stmt)]


@srouter.post("", status_code=201)
def create_supplier(data: SupplierIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    s = Supplier(**data.model_dump())
    db.add(s)
    db.flush()
    audit(db, user, "create", "supplier", s.id, s.name)
    db.commit()
    return supplier_out(s)


@srouter.put("/{sid}")
def update_supplier(sid: int, data: SupplierIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    s = db.get(Supplier, sid)
    if not s:
        raise HTTPException(404, "Supplier not found")
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    audit(db, user, "update", "supplier", s.id, s.name)
    db.commit()
    return supplier_out(s)


# ---------- Purchases ----------
@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    ms = date.today().replace(day=1)
    active = (Purchase.status != "cancelled",)
    month = db.execute(select(func.count(), func.coalesce(func.sum(Purchase.total), 0)).where(
        *active, Purchase.date >= ms)).one()
    payable = db.execute(select(func.count(), func.coalesce(func.sum(Purchase.total - Purchase.paid), 0)).where(
        Purchase.status.in_(("unpaid", "partial")))).one()
    veh = db.scalar(select(func.coalesce(func.sum(PurchaseLine.qty), 0)).join(Purchase).where(
        *active, Purchase.date >= ms, PurchaseLine.kind == "vehicle"))
    parts = db.scalar(select(func.coalesce(func.sum(PurchaseLine.taxable), 0)).join(Purchase).where(
        *active, Purchase.date >= ms, PurchaseLine.kind == "part"))
    return {"month_count": month[0], "month_total": r2(month[1]), "payable_count": payable[0],
            "payable_total": r2(payable[1]), "month_vehicles": int(veh), "month_parts_value": r2(parts)}


@router.get("")
def list_purchases(status: str = "", q: str = "", supplier_id: int | None = None, date_from: date | None = None,
                   date_to: date | None = None, limit: int = 50, offset: int = 0, db: Session = Depends(get_db),
                   _=Depends(require_roles(*MGMT))):
    stmt = select(Purchase).join(Supplier)
    if status == "due":
        stmt = stmt.where(Purchase.status.in_(("unpaid", "partial")))
    elif status:
        stmt = stmt.where(Purchase.status == status)
    if supplier_id:
        stmt = stmt.where(Purchase.supplier_id == supplier_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Purchase.number.ilike(like), Purchase.supplier_invoice_no.ilike(like),
                              Supplier.name.ilike(like)))
    if date_from:
        stmt = stmt.where(Purchase.date >= date_from)
    if date_to:
        stmt = stmt.where(Purchase.date <= date_to)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Purchase.date.desc(), Purchase.id.desc()).offset(offset).limit(min(limit, 200)))
    return {"total": total, "items": [purchase_summary(p) for p in rows]}


@router.post("", status_code=201)
def create_purchase(data: PurchaseIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    supplier = db.get(Supplier, data.supplier_id)
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    if data.supplier_invoice_no and db.scalar(select(Purchase).where(
            Purchase.supplier_id == supplier.id, Purchase.supplier_invoice_no == data.supplier_invoice_no,
            Purchase.status != "cancelled")):
        raise HTTPException(400, f"Supplier bill {data.supplier_invoice_no} is already entered")

    # Validate catalogue items and chassis numbers before touching stock.
    seen, prepared = set(), []
    for l in data.items:
        item = db.get(Item, l.item_id)
        if not item or item.kind == "service":
            raise HTTPException(400, "Purchases can only contain spare parts or vehicle models")
        if item.kind == "vehicle":
            if int(l.qty) != l.qty or len(l.units) != int(l.qty):
                raise HTTPException(400, f"Enter chassis details for all {int(l.qty)} × {item.name}")
            for u in l.units:
                if u.chassis_no in seen or db.scalar(select(VehicleUnit).where(VehicleUnit.chassis_no == u.chassis_no)):
                    raise HTTPException(400, f"Chassis {u.chassis_no} already exists")
                seen.add(u.chassis_no)
        prepared.append((item, l))

    biz = get_business(db)
    interstate = data.is_interstate if data.is_interstate is not None else bool(
        supplier.state and biz.state and supplier.state.lower() != biz.state.lower())

    class L:  # adapter for compute_lines
        def __init__(self, item, l):
            self.item_id, self.kind, self.description, self.hsn_sac = item.id, item.kind, item.name, item.hsn_sac
            self.qty, self.unit_price, self.discount, self.gst_rate = l.qty, l.unit_price, l.discount, l.gst_rate

    lines, totals = compute_lines([L(i, l) for i, l in prepared], interstate)
    p = Purchase(number=next_number(db, biz.purchase_prefix, data.date or date.today()), supplier_id=supplier.id,
                 supplier_invoice_no=data.supplier_invoice_no, date=data.date or date.today(),
                 is_interstate=interstate, notes=data.notes, created_by=user.id, **totals)
    for d in lines:
        d.pop("vehicle_unit_id", None)
        p.lines.append(PurchaseLine(**d))
    db.add(p)
    db.flush()

    for (item, l), line in zip(prepared, p.lines):
        landed = r2(line.taxable / line.qty) if line.qty else 0  # cost excl. GST after discount
        if item.kind == "part":
            adjust_part(db, item.id, l.qty, "purchase", p.number, user)
        else:
            for u in l.units:
                db.add(VehicleUnit(item_id=item.id, purchase_id=p.id, cost=landed, received_on=p.date,
                                   **u.model_dump()))
            recount_vehicle_stock(db, item.id)
        item.cost_price = landed
    if data.payment:
        if data.payment.amount > p.total + 0.009:
            raise HTTPException(400, "Payment exceeds bill total")
        p.payments.append(SupplierPayment(amount=r2(data.payment.amount), mode=data.payment.mode,
                                          reference=data.payment.reference, date=data.payment.date or date.today(),
                                          created_by=user.id))
    refresh_status(p)
    audit(db, user, "create", "purchase", p.id, f"{p.number} · {supplier.name} · ₹{p.total:,.2f}")
    db.commit()
    return purchase_out(db, p)


@router.get("/{pid}")
def get_purchase(pid: int, db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    p = db.get(Purchase, pid)
    if not p:
        raise HTTPException(404, "Purchase not found")
    return purchase_out(db, p)


@router.post("/{pid}/cancel")
def cancel_purchase(pid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    p = db.get(Purchase, pid)
    if not p or p.status == "cancelled":
        raise HTTPException(400, "Purchase not found or already cancelled")
    if p.payments:
        raise HTTPException(400, "Remove supplier payments before cancelling")
    units = db.scalars(select(VehicleUnit).where(VehicleUnit.purchase_id == p.id)).all()
    moved = [u.chassis_no for u in units if u.status != "in_stock"]
    if moved:
        raise HTTPException(400, f"Cannot cancel: {', '.join(moved[:3])} already sold or sent to a sub-dealer")
    for line in p.lines:
        if line.kind == "part":
            adjust_part(db, line.item_id, -line.qty, "purchase-cancel", p.number, user)
    item_ids = {u.item_id for u in units}
    for u in units:
        db.delete(u)
    for iid in item_ids:
        recount_vehicle_stock(db, iid)
    p.status = "cancelled"
    audit(db, user, "cancel", "purchase", p.id, f"{p.number} · ₹{p.total:,.2f}")
    db.commit()
    return purchase_out(db, p)


@router.post("/{pid}/payments", status_code=201)
def pay_supplier(pid: int, data: PaymentIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    p = db.get(Purchase, pid)
    if not p or p.status == "cancelled":
        raise HTTPException(400, "Purchase not found or cancelled")
    if data.amount > r2(p.total - p.paid) + 0.009:
        raise HTTPException(400, f"Amount exceeds balance ({p.total - p.paid:,.2f})")
    p.payments.append(SupplierPayment(amount=r2(data.amount), mode=data.mode, reference=data.reference,
                                      date=data.date or date.today(), created_by=user.id))
    refresh_status(p)
    audit(db, user, "payment", "purchase", p.id, f"{p.number}: ₹{data.amount:,.2f} to {p.supplier.name}")
    db.commit()
    return purchase_out(db, p)


@router.delete("/payments/{payid}")
def delete_supplier_payment(payid: int, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    x = db.get(SupplierPayment, payid)
    if not x:
        raise HTTPException(404, "Payment not found")
    p = db.get(Purchase, x.purchase_id)
    p.payments.remove(x)
    db.flush()
    refresh_status(p)
    audit(db, user, "delete-payment", "purchase", p.id, f"{p.number}: ₹{x.amount:,.2f}")
    db.commit()
    return purchase_out(db, p)
