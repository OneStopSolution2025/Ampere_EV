from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Customer, Invoice, InvoiceLine, Item, JobCard, Payment, Purchase, PurchaseLine, Subdealer, User, VehicleUnit
from ..security import MGMT, require_roles
from ..services import r2

router = APIRouter(prefix="/reports", tags=["reports"])


def period(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    end = date_to or date.today()
    start = date_from or end.replace(day=1)
    return start, end


@router.get("/sales")
def sales(date_from: date | None = None, date_to: date | None = None, category: str = "",
          db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    start, end = period(date_from, date_to)
    where = (Invoice.doc_type == "invoice", Invoice.status != "cancelled", Invoice.date >= start, Invoice.date <= end,
             *((Invoice.category == category,) if category else ()))
    t = db.execute(select(func.count(), func.coalesce(func.sum(Invoice.taxable), 0),
                          func.coalesce(func.sum(Invoice.cgst + Invoice.sgst + Invoice.igst), 0),
                          func.coalesce(func.sum(Invoice.discount), 0),
                          func.coalesce(func.sum(Invoice.total), 0), func.coalesce(func.sum(Invoice.paid), 0))
                   .where(*where)).one()
    daily = db.execute(select(Invoice.date, func.count(), func.sum(Invoice.total)).where(*where)
                       .group_by(Invoice.date).order_by(Invoice.date)).all()
    modes = db.execute(select(Payment.mode, func.sum(Payment.amount)).join(Invoice).where(
        Invoice.status != "cancelled", Payment.date >= start, Payment.date <= end).group_by(Payment.mode)).all()
    rows = db.scalars(select(Invoice).where(*where).order_by(Invoice.date, Invoice.id))
    cats = dict(db.execute(select(Invoice.category, func.sum(Invoice.total)).where(*where).group_by(Invoice.category)).all())
    return {
        "by_category": {c: r2(cats.get(c, 0)) for c in ("vehicle", "spare", "service")},
        "from": start.isoformat(), "to": end.isoformat(),
        "totals": {"count": t[0], "taxable": r2(t[1]), "tax": r2(t[2]), "discount": r2(t[3]), "total": r2(t[4]),
                   "paid": r2(t[5]), "outstanding": r2(t[4] - t[5])},
        "daily": [{"date": d.isoformat(), "count": c, "total": r2(s)} for d, c, s in daily],
        "payment_modes": {m: r2(a) for m, a in modes},
        "invoices": [{"id": i.id, "number": i.number, "date": i.date.isoformat(), "category": i.category,
                      "customer": i.party_name, "gstin": (i.subdealer or i.customer).gstin,
                      "taxable": i.taxable, "cgst": i.cgst, "sgst": i.sgst, "igst": i.igst, "total": i.total,
                      "paid": i.paid, "status": i.status} for i in rows],
    }


@router.get("/gst")
def gst(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
        _=Depends(require_roles(*MGMT))):
    start, end = period(date_from, date_to)
    where = (Invoice.doc_type == "invoice", Invoice.status != "cancelled", Invoice.date >= start, Invoice.date <= end)
    intra_tax = case((Invoice.is_interstate.is_(False), InvoiceLine.tax), else_=0)
    inter_tax = case((Invoice.is_interstate.is_(True), InvoiceLine.tax), else_=0)
    by_rate = db.execute(select(InvoiceLine.gst_rate, func.sum(InvoiceLine.taxable), func.sum(intra_tax),
                                func.sum(inter_tax)).join(Invoice).where(*where)
                         .group_by(InvoiceLine.gst_rate).order_by(InvoiceLine.gst_rate)).all()
    by_hsn = db.execute(select(InvoiceLine.hsn_sac, InvoiceLine.gst_rate, func.sum(InvoiceLine.qty),
                               func.sum(InvoiceLine.taxable), func.sum(InvoiceLine.tax)).join(Invoice).where(*where)
                        .group_by(InvoiceLine.hsn_sac, InvoiceLine.gst_rate).order_by(InvoiceLine.hsn_sac)).all()
    b2b = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0))
                    .outerjoin(Customer, Invoice.customer_id == Customer.id)
                    .outerjoin(Subdealer, Invoice.subdealer_id == Subdealer.id)
                    .where(*where, func.coalesce(Customer.gstin, Subdealer.gstin, "") != ""))
    total = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(*where))
    return {
        "from": start.isoformat(), "to": end.isoformat(),
        "by_rate": [{"rate": r, "taxable": r2(tx), "cgst": r2((ia or 0) / 2), "sgst": r2((ia or 0) - r2((ia or 0) / 2)),
                     "igst": r2(ie)} for r, tx, ia, ie in by_rate],
        "by_hsn": [{"hsn_sac": h or "-", "rate": r, "qty": r2(q), "taxable": r2(tx), "tax": r2(t)}
                   for h, r, q, tx, t in by_hsn],
        "b2b_total": r2(b2b), "b2c_total": r2(total - b2b),
    }


@router.get("/receivables")
def receivables(db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    today = date.today()
    rows = db.scalars(select(Invoice).where(Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial")))
                      .order_by(Invoice.date))
    out, buckets = [], {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
    for i in rows:
        age = (today - i.date).days
        bal = r2(i.total - i.paid)
        key = "0-30" if age <= 30 else "31-60" if age <= 60 else "61-90" if age <= 90 else "90+"
        buckets[key] = r2(buckets[key] + bal)
        out.append({"id": i.id, "number": i.number, "date": i.date.isoformat(), "customer": i.party_name,
                    "phone": i.party_phone, "type": "Sub-dealer" if i.subdealer_id else "Customer", "total": i.total, "paid": i.paid, "balance": bal, "age": age})
    return {"buckets": buckets, "total": r2(sum(buckets.values())), "invoices": out}


@router.get("/stock")
def stock(db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    rows = db.scalars(select(Item).where(Item.kind == "part", Item.is_active.is_(True)).order_by(Item.name))
    items = [{"id": i.id, "name": i.name, "sku": i.sku, "stock": i.stock, "reorder_level": i.reorder_level,
              "cost_price": i.cost_price, "value": r2(i.stock * i.cost_price), "low": i.stock <= i.reorder_level}
             for i in rows]
    return {"items": items, "total_value": r2(sum(i["value"] for i in items)),
            "low_count": sum(1 for i in items if i["low"])}


@router.get("/technicians")
def technicians(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
                _=Depends(require_roles(*MGMT))):
    start, end = period(date_from, date_to)
    end_dt = end + timedelta(days=1)
    rows = db.execute(select(User.name,
                             func.count(JobCard.id),
                             func.sum(case((JobCard.status.in_(("completed", "invoiced")), 1), else_=0)))
                      .join(JobCard, JobCard.technician_id == User.id)
                      .where(JobCard.created_at >= start, JobCard.created_at < end_dt)
                      .group_by(User.name).order_by(User.name)).all()
    return [{"name": n, "assigned": a, "completed": int(c or 0)} for n, a, c in rows]


@router.get("/purchases")
def purchases(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
              _=Depends(require_roles(*MGMT))):
    start, end = period(date_from, date_to)
    rows = db.scalars(select(Purchase).where(Purchase.status != "cancelled", Purchase.date >= start,
                                             Purchase.date <= end).order_by(Purchase.date, Purchase.id)).all()
    itc = db.execute(select(PurchaseLine.gst_rate, func.sum(PurchaseLine.taxable), func.sum(PurchaseLine.tax))
                     .join(Purchase).where(Purchase.status != "cancelled", Purchase.date >= start, Purchase.date <= end)
                     .group_by(PurchaseLine.gst_rate).order_by(PurchaseLine.gst_rate)).all()
    return {
        "from": start.isoformat(), "to": end.isoformat(),
        "totals": {"count": len(rows), "taxable": r2(sum(p.taxable for p in rows)),
                   "tax": r2(sum(p.cgst + p.sgst + p.igst for p in rows)), "total": r2(sum(p.total for p in rows)),
                   "paid": r2(sum(p.paid for p in rows)), "payable": r2(sum(p.total - p.paid for p in rows))},
        "input_tax": [{"rate": r, "taxable": r2(t), "tax": r2(x)} for r, t, x in itc],
        "purchases": [{"id": p.id, "number": p.number, "date": p.date.isoformat(), "supplier": p.supplier.name,
                       "gstin": p.supplier.gstin, "supplier_invoice_no": p.supplier_invoice_no, "taxable": p.taxable,
                       "tax": r2(p.cgst + p.sgst + p.igst), "total": p.total, "paid": p.paid, "status": p.status}
                      for p in rows],
    }


@router.get("/vehicle-sales")
def vehicle_sales(date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db),
                  _=Depends(require_roles(*MGMT))):
    """Every vehicle that left the showroom in the period, with margin."""
    start, end = period(date_from, date_to)
    rows = db.execute(select(InvoiceLine, Invoice, VehicleUnit).join(Invoice).join(
        VehicleUnit, InvoiceLine.vehicle_unit_id == VehicleUnit.id).where(
        Invoice.doc_type == "invoice", Invoice.status != "cancelled", Invoice.date >= start, Invoice.date <= end)
        .order_by(Invoice.date)).all()
    out = [{"invoice_id": inv.id, "number": inv.number, "date": inv.date.isoformat(), "party": inv.party_name,
            "channel": "Sub-dealer" if inv.subdealer_id else "Retail", "model": u.item.name, "chassis_no": u.chassis_no,
            "color": u.color, "sale_value": l.taxable, "cost": u.cost, "margin": r2(l.taxable - u.cost)}
           for l, inv, u in rows]
    models = {}
    for r in out:
        m = models.setdefault(r["model"], {"model": r["model"], "units": 0, "sale_value": 0, "margin": 0})
        m["units"] += 1
        m["sale_value"] = r2(m["sale_value"] + r["sale_value"])
        m["margin"] = r2(m["margin"] + r["margin"])
    return {"from": start.isoformat(), "to": end.isoformat(), "units": out, "by_model": list(models.values()),
            "totals": {"units": len(out), "sale_value": r2(sum(r["sale_value"] for r in out)),
                       "margin": r2(sum(r["margin"] for r in out)),
                       "retail": sum(1 for r in out if r["channel"] == "Retail"),
                       "subdealer": sum(1 for r in out if r["channel"] == "Sub-dealer")}}
