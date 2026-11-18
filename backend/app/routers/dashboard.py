from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditLog, Invoice, InvoiceLine, Item, JobCard, Payment, Purchase, Subdealer, User, VehicleUnit
from ..security import EVERYONE, require_roles
from ..services import r2
from . import subdealers as sd
from . import vehicle_stock
from .invoices import invoice_summary
from .jobcards import jobcard_out
from .purchases import purchase_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
ACTIVE_INV = (Invoice.doc_type == "invoice", Invoice.status != "cancelled")
CATS = ("vehicle", "spare", "service")


def by_category(db: Session, start: date, end: date) -> dict:
    rows = dict(db.execute(select(Invoice.category, func.sum(Invoice.total)).where(
        *ACTIVE_INV, Invoice.date >= start, Invoice.date <= end).group_by(Invoice.category)).all())
    out = {c: r2(rows.get(c, 0)) for c in CATS}
    out["total"] = r2(sum(out.values()))
    return out


def collections(db: Session, start: date, end: date) -> dict:
    rows = db.execute(select(Payment.mode, func.sum(Payment.amount)).join(Invoice).where(
        Invoice.status != "cancelled", Payment.date >= start, Payment.date <= end).group_by(Payment.mode)).all()
    return {m: r2(a) for m, a in rows}


def jobcard_counts(db: Session, technician_id: int | None = None) -> dict:
    stmt = select(JobCard.status, func.count()).group_by(JobCard.status)
    if technician_id:
        stmt = stmt.where(JobCard.technician_id == technician_id)
    return {s: c for s, c in db.execute(stmt).all()}


def series(db: Session, days: int = 14) -> list[dict]:
    start = date.today() - timedelta(days=days - 1)
    rows = db.execute(select(Invoice.date, Invoice.category, func.sum(Invoice.total)).where(
        *ACTIVE_INV, Invoice.date >= start).group_by(Invoice.date, Invoice.category)).all()
    data = {}
    for d, c, t in rows:
        data.setdefault(d, {})[c] = r2(t)
    out = []
    for i in range(days):
        d = start + timedelta(i)
        row = {"date": d.isoformat(), **{c: data.get(d, {}).get(c, 0) for c in CATS}}
        row["total"] = r2(sum(row[c] for c in CATS))
        out.append(row)
    return out


@router.get("")
def dashboard(db: Session = Depends(get_db), user: User = Depends(require_roles(*EVERYONE))):
    today = date.today()
    ms = today.replace(day=1)

    if user.role == "subdealer":
        s = db.get(Subdealer, user.subdealer_id)
        units = db.scalars(select(VehicleUnit).where(VehicleUnit.subdealer_id == s.id,
                                                     VehicleUnit.status == "with_subdealer").order_by(VehicleUnit.received_on))
        invs = db.scalars(select(Invoice).where(Invoice.subdealer_id == s.id, Invoice.doc_type == "invoice")
                          .order_by(Invoice.id.desc()).limit(8))
        return {"role": "subdealer", "subdealer": sd.sd_out(db, s),
                "holding": [vehicle_stock.unit_out(db, u) for u in units],
                "recent_invoices": [invoice_summary(i) for i in invs]}

    if user.role == "technician":
        mine = db.scalars(select(JobCard).where(JobCard.technician_id == user.id,
                                                JobCard.status.in_(("open", "in_progress")))
                          .order_by(JobCard.estimated_delivery.is_(None), JobCard.estimated_delivery, JobCard.id))
        done = db.scalar(select(func.count()).select_from(JobCard).where(
            JobCard.technician_id == user.id, JobCard.status.in_(("completed", "invoiced")), JobCard.updated_at >= ms))
        return {"role": "technician", "counts": jobcard_counts(db, user.id), "completed_this_month": done,
                "queue": [jobcard_out(j) for j in mine]}

    today_sales = by_category(db, today, today)
    today_coll = collections(db, today, today)
    receivable_rows = dict(db.execute(select(Invoice.subdealer_id.is_not(None), func.sum(Invoice.total - Invoice.paid))
                                      .where(Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial")))
                                      .group_by(Invoice.subdealer_id.is_not(None))).all())
    receivables = {"customers": r2(receivable_rows.get(False, 0)), "subdealers": r2(receivable_rows.get(True, 0))}
    receivables["total"] = r2(receivables["customers"] + receivables["subdealers"])
    ready = db.scalars(select(JobCard).where(JobCard.status == "completed").order_by(JobCard.updated_at.desc()).limit(8))
    due = db.scalars(select(Invoice).where(Invoice.doc_type == "invoice", Invoice.status.in_(("unpaid", "partial")))
                     .order_by(Invoice.date).limit(8))
    available = db.execute(select(Item.name, Item.stock).where(Item.kind == "vehicle", Item.is_active.is_(True))
                           .order_by(Item.name)).all()
    base = {
        "today": today_sales, "today_bills": db.scalar(select(func.count()).select_from(Invoice).where(
            *ACTIVE_INV, Invoice.date == today)),
        "today_collections": today_coll, "today_collected": r2(sum(today_coll.values())),
        "receivables": receivables, "jobcards": jobcard_counts(db),
        "ready_to_bill": [jobcard_out(j) for j in ready], "due_invoices": [invoice_summary(i) for i in due],
        "vehicles_available": [{"model": n, "stock": int(s)} for n, s in available],
    }
    if user.role == "cashier":
        return {"role": "cashier", **base}

    # ---- Manager / Admin: complete business view ----
    month = by_category(db, ms, today)
    pm_end = ms - timedelta(days=1)
    pm_start = pm_end.replace(day=1)
    prev = by_category(db, pm_start, pm_start.replace(day=min(today.day, pm_end.day)))
    payable = db.scalar(select(func.coalesce(func.sum(Purchase.total - Purchase.paid), 0)).where(
        Purchase.status.in_(("unpaid", "partial"))))
    month_purchases = db.scalar(select(func.coalesce(func.sum(Purchase.total), 0)).where(
        Purchase.status != "cancelled", Purchase.date >= ms))
    spare_rows = db.execute(select(func.count(), func.coalesce(func.sum(Item.stock * Item.cost_price), 0)).where(
        Item.kind == "part", Item.is_active.is_(True))).one()
    low_spares = db.scalar(select(func.count()).select_from(Item).where(
        Item.kind == "part", Item.is_active.is_(True), Item.stock <= Item.reorder_level))
    top_spares = db.execute(select(InvoiceLine.description, func.sum(InvoiceLine.qty), func.sum(InvoiceLine.total))
                            .join(Invoice).where(*ACTIVE_INV, Invoice.date >= ms, InvoiceLine.kind == "part")
                            .group_by(InvoiceLine.description).order_by(func.sum(InvoiceLine.total).desc()).limit(5)).all()
    techs = db.execute(select(User.name, func.count(JobCard.id)).join(JobCard, JobCard.technician_id == User.id)
                       .where(JobCard.status.in_(("open", "in_progress"))).group_by(User.name)).all()
    subdealers = [sd.sd_out(db, s) for s in db.scalars(select(Subdealer).where(Subdealer.is_active.is_(True)))]
    subdealers.sort(key=lambda s: -s["outstanding"])
    recent_inv = db.scalars(select(Invoice).where(Invoice.doc_type == "invoice").order_by(Invoice.id.desc()).limit(8))
    recent_pur = db.scalars(select(Purchase).order_by(Purchase.id.desc()).limit(5))
    out = {
        "role": user.role, **base,
        "month": month,
        "month_growth": r2((month["total"] - prev["total"]) / prev["total"] * 100) if prev["total"] else None,
        "series": series(db),
        "payables": r2(payable), "month_purchases": r2(month_purchases),
        "vehicle_stock": vehicle_stock.summary(db),
        "spares": {"items": spare_rows[0], "value": r2(spare_rows[1]), "low": low_spares,
                   "top": [{"name": n, "qty": r2(q), "total": r2(t)} for n, q, t in top_spares]},
        "technician_load": [{"name": n, "active": c} for n, c in techs],
        "subdealers": subdealers[:6],
        "recent_invoices": [invoice_summary(i) for i in recent_inv],
        "recent_purchases": [purchase_summary(p) for p in recent_pur],
    }
    if user.role == "admin":
        out["recent_activity"] = [{"id": a.id, "user_name": a.user_name, "action": a.action, "entity": a.entity,
                                   "detail": a.detail, "created_at": a.created_at.isoformat()}
                                  for a in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(10))]
        out["users"] = dict(db.execute(select(User.role, func.count()).where(User.is_active.is_(True))
                                       .group_by(User.role)).all())
    return out
