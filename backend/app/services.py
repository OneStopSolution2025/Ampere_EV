"""Shared business logic: numbering, GST, stock & vehicle movements, audit trail."""
from datetime import date
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (AuditLog, Business, Counter, Customer, Invoice, InvoiceLine, Item, JobCard, StockMove, User,
                     Vehicle, VehicleUnit)


def r2(x: float) -> float:
    return round((x or 0) + 1e-9, 2)


def get_business(db: Session) -> Business:
    biz = db.scalar(select(Business).limit(1))
    if not biz:
        biz = Business()
        db.add(biz)
        db.flush()
    return biz


def audit(db: Session, user: User | None, action: str, entity: str, entity_id: int | None = None, detail: str = ""):
    db.add(AuditLog(user_id=user.id if user else None, user_name=user.name if user else "System", action=action,
                    entity=entity, entity_id=entity_id, detail=detail[:500] if detail else None))


def fy_label(d: date) -> str:
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def next_number(db: Session, prefix: str, d: date | None = None) -> str:
    d = d or date.today()
    fy = fy_label(d)
    key = f"{prefix}/{fy}"
    counter = db.execute(select(Counter).where(Counter.key == key).with_for_update()).scalar_one_or_none()
    if not counter:
        counter = Counter(key=key, value=0)
        db.add(counter)
    counter.value += 1
    db.flush()
    return f"{prefix}/{fy}/{counter.value:04d}"


def doc_prefix(biz: Business, doc_type: str, category: str) -> str:
    if doc_type == "estimate":
        return biz.estimate_prefix
    return {"vehicle": biz.vehicle_prefix, "spare": biz.spare_prefix}.get(category, biz.service_prefix)


def compute_lines(lines_in: Iterable, interstate: bool) -> tuple[list[dict], dict]:
    lines, subtotal, discount, taxable_total, tax_total = [], 0.0, 0.0, 0.0, 0.0
    for l in lines_in:
        qty = float(l.qty or 0)
        price = float(l.unit_price or 0)
        rate = float(l.gst_rate or 0)
        gross = r2(qty * price)
        disc = r2(min(float(getattr(l, "discount", 0) or 0), gross))
        taxable = r2(gross - disc)
        tax = r2(taxable * rate / 100)
        lines.append(dict(item_id=l.item_id, vehicle_unit_id=getattr(l, "vehicle_unit_id", None), kind=l.kind,
                          description=l.description, hsn_sac=l.hsn_sac, qty=qty, unit_price=price, discount=disc,
                          gst_rate=rate, taxable=taxable, tax=tax, total=r2(taxable + tax)))
        subtotal += gross
        discount += disc
        taxable_total += taxable
        tax_total += tax
    tax_total = r2(tax_total)
    if interstate:
        cgst = sgst = 0.0
        igst = tax_total
    else:
        cgst = r2(tax_total / 2)
        sgst = r2(tax_total - cgst)
        igst = 0.0
    grand = r2(taxable_total + tax_total)
    total = float(round(grand))
    return lines, dict(subtotal=r2(subtotal), discount=r2(discount), taxable=r2(taxable_total), cgst=cgst, sgst=sgst,
                       igst=igst, round_off=r2(total - grand), total=total)


def recount_vehicle_stock(db: Session, item_id: int):
    item = db.get(Item, item_id)
    if item:
        db.flush()
        item.stock = db.scalar(select(func.count()).select_from(VehicleUnit).where(
            VehicleUnit.item_id == item_id, VehicleUnit.status == "in_stock")) or 0


def adjust_part(db: Session, item_id: int, qty: float, reason: str, ref: str, user: User | None):
    item = db.get(Item, item_id)
    if not item or item.kind != "part":
        return
    item.stock = r2(item.stock + qty)
    db.add(StockMove(item_id=item.id, qty=qty, reason=reason, reference=ref, user_id=user.id if user else None))


def apply_invoice_effects(db: Session, inv: Invoice, user: User):
    """Deduct parts, move vehicle units out of stock. Only for tax invoices."""
    if inv.doc_type != "invoice":
        return
    for line in inv.lines:
        if line.kind == "part" and line.item_id:
            adjust_part(db, line.item_id, -line.qty, "sale", inv.number, user)
        elif line.kind == "vehicle":
            unit = db.get(VehicleUnit, line.vehicle_unit_id) if line.vehicle_unit_id else None
            if not unit:
                raise HTTPException(400, f"Select a chassis number for '{line.description}'")
            if unit.status != "in_stock":
                raise HTTPException(400, f"Vehicle {unit.chassis_no} is not in showroom stock")
            unit.invoice_id = inv.id
            if inv.subdealer_id:
                unit.status, unit.subdealer_id = "with_subdealer", inv.subdealer_id
            else:
                unit.status, unit.sold_on = "sold", inv.date
                cv = Vehicle(customer_id=inv.customer_id, make=unit.item.brand or "Ampere", model=unit.item.name,
                             color=unit.color, fuel_type="Electric", year=unit.mfg_year, vin=unit.chassis_no,
                             motor_no=unit.motor_no, battery_no=unit.battery_no, odometer=0, sold_on=inv.date)
                db.add(cv)
                db.flush()
                unit.customer_vehicle_id = cv.id
                if not inv.vehicle_id:
                    inv.vehicle_id = cv.id
            recount_vehicle_stock(db, unit.item_id)


def reverse_invoice_effects(db: Session, inv: Invoice, user: User, reason: str = "cancel"):
    if inv.doc_type != "invoice":
        return
    for line in inv.lines:
        if line.kind == "part" and line.item_id:
            adjust_part(db, line.item_id, line.qty, reason, inv.number, user)
        elif line.kind == "vehicle" and line.vehicle_unit_id:
            unit = db.get(VehicleUnit, line.vehicle_unit_id)
            if not unit or unit.invoice_id != inv.id:
                continue
            if unit.status == "with_subdealer" and unit.retail_customer:
                raise HTTPException(400, f"Vehicle {unit.chassis_no} has already been retailed by the sub-dealer")
            if unit.customer_vehicle_id:
                cv = db.get(Vehicle, unit.customer_vehicle_id)
                in_use = db.scalar(select(func.count()).select_from(JobCard).where(JobCard.vehicle_id == cv.id)) if cv else 0
                if cv and not in_use:
                    if inv.vehicle_id == cv.id:
                        inv.vehicle_id = None
                    db.flush()
                    db.delete(cv)
            unit.status, unit.subdealer_id, unit.invoice_id = "in_stock", None, None
            unit.customer_vehicle_id, unit.sold_on = None, None
            recount_vehicle_stock(db, unit.item_id)


def refresh_status(doc):
    """Works for Invoice and Purchase."""
    if doc.status == "cancelled":
        return
    if getattr(doc, "doc_type", "invoice") == "estimate":
        if doc.status not in ("open", "converted"):
            doc.status = "open"
        return
    doc.paid = r2(sum(p.amount for p in doc.payments))
    if doc.paid >= doc.total - 0.009 and doc.total > 0:
        doc.status = "paid"
    elif doc.paid > 0:
        doc.status = "partial"
    else:
        doc.status = "unpaid"


def build_lines(inv: Invoice, line_dicts: list[dict]):
    inv.lines.clear()
    for d in line_dicts:
        inv.lines.append(InvoiceLine(**d))
