from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Invoice, Item, Purchase, Subdealer, User, VehicleUnit
from ..schemas import OpeningUnitIn, RetailIn, UnitUpdateIn
from ..security import MGMT, STAFF, require_roles
from ..services import audit, r2, recount_vehicle_stock

router = APIRouter(prefix="/vehicle-units", tags=["vehicle stock"])
VIEWERS = STAFF + ("subdealer",)

STATUS_LABEL = {"in_stock": "In showroom", "with_subdealer": "With sub-dealer", "sold": "Sold"}


def unit_out(db: Session, u: VehicleUnit, detail: bool = False) -> dict:
    out = {
        "id": u.id, "item_id": u.item_id, "model": u.item.name, "chassis_no": u.chassis_no, "motor_no": u.motor_no,
        "battery_no": u.battery_no, "charger_no": u.charger_no, "color": u.color, "mfg_year": u.mfg_year,
        "cost": u.cost, "price": u.item.price, "status": u.status, "subdealer_id": u.subdealer_id,
        "subdealer_name": u.subdealer.name if u.subdealer else None, "invoice_id": u.invoice_id,
        "retail_customer": u.retail_customer, "retail_phone": u.retail_phone,
        "sold_on": u.sold_on.isoformat() if u.sold_on else None, "received_on": u.received_on.isoformat(),
        "age_days": (date.today() - u.received_on).days,
    }
    if detail:
        p = db.get(Purchase, u.purchase_id) if u.purchase_id else None
        inv = db.get(Invoice, u.invoice_id) if u.invoice_id else None
        out["purchase"] = {"id": p.id, "number": p.number, "supplier": p.supplier.name, "date": p.date.isoformat(),
                           "supplier_invoice_no": p.supplier_invoice_no} if p else None
        out["invoice"] = {"id": inv.id, "number": inv.number, "party": inv.party_name, "date": inv.date.isoformat(),
                          "total": inv.total} if inv else None
    return out


def load(db: Session, uid: int, user: User) -> VehicleUnit:
    u = db.get(VehicleUnit, uid)
    if not u or (user.role == "subdealer" and u.subdealer_id != user.subdealer_id):
        raise HTTPException(404, "Vehicle not found")
    return u


@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    ms = date.today().replace(day=1)
    counts = dict(db.execute(select(VehicleUnit.status, func.count()).group_by(VehicleUnit.status)).all())
    value = db.scalar(select(func.coalesce(func.sum(VehicleUnit.cost), 0)).where(VehicleUnit.status == "in_stock"))
    sold_month = db.scalar(select(func.count()).select_from(VehicleUnit).where(
        VehicleUnit.status == "sold", VehicleUnit.sold_on >= ms))
    aged = db.scalar(select(func.count()).select_from(VehicleUnit).where(
        VehicleUnit.status == "in_stock", VehicleUnit.received_on <= date.today().fromordinal(date.today().toordinal() - 60)))
    by_model = db.execute(
        select(Item.id, Item.name, Item.price, Item.reorder_level,
               func.sum(case((VehicleUnit.status == "in_stock", 1), else_=0)),
               func.sum(case((VehicleUnit.status == "with_subdealer", 1), else_=0)),
               func.sum(case(((VehicleUnit.status == "sold") & (VehicleUnit.sold_on >= ms), 1), else_=0)))
        .select_from(Item).outerjoin(VehicleUnit, VehicleUnit.item_id == Item.id)
        .where(Item.kind == "vehicle", Item.is_active.is_(True)).group_by(Item.id, Item.name, Item.price, Item.reorder_level)
        .order_by(Item.name)).all()
    by_color = db.execute(select(Item.name, VehicleUnit.color, func.count()).join(Item).where(
        VehicleUnit.status == "in_stock").group_by(Item.name, VehicleUnit.color).order_by(Item.name)).all()
    return {
        "in_stock": counts.get("in_stock", 0), "with_subdealer": counts.get("with_subdealer", 0),
        "sold": counts.get("sold", 0), "sold_this_month": sold_month, "stock_value": r2(value), "aged_60": aged,
        "by_model": [{"item_id": i, "model": n, "price": p, "in_stock": int(s or 0), "with_subdealer": int(w or 0),
                      "sold_this_month": int(m or 0), "low": int(s or 0) <= (rl or 0)} for i, n, p, rl, s, w, m in by_model],
        "by_color": [{"model": n, "color": c or "—", "count": k} for n, c, k in by_color],
    }


@router.get("")
def list_units(status: str = "", item_id: int | None = None, subdealer_id: int | None = None, q: str = "",
               limit: int = 50, offset: int = 0, db: Session = Depends(get_db),
               user: User = Depends(require_roles(*VIEWERS))):
    stmt = select(VehicleUnit).join(Item)
    if user.role == "subdealer":
        stmt = stmt.where(VehicleUnit.subdealer_id == user.subdealer_id)
    elif subdealer_id:
        stmt = stmt.where(VehicleUnit.subdealer_id == subdealer_id)
    if status == "retailed":
        stmt = stmt.where(VehicleUnit.retail_customer.is_not(None))
    elif status:
        stmt = stmt.where(VehicleUnit.status == status)
    if item_id:
        stmt = stmt.where(VehicleUnit.item_id == item_id)
    if q:
        like = f"%{''.join(q.upper().split())}%"
        stmt = stmt.where(or_(VehicleUnit.chassis_no.ilike(like), VehicleUnit.motor_no.ilike(like),
                              VehicleUnit.battery_no.ilike(like), Item.name.ilike(f"%{q}%"),
                              VehicleUnit.color.ilike(f"%{q}%"), VehicleUnit.retail_customer.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(VehicleUnit.id.desc()).offset(offset).limit(min(limit, 200)))
    return {"total": total, "items": [unit_out(db, u) for u in rows]}


@router.get("/{uid}")
def get_unit(uid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*VIEWERS))):
    return unit_out(db, load(db, uid, user), True)


@router.post("", status_code=201)
def add_opening_unit(data: OpeningUnitIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    """Opening stock or manual entry for vehicles not received through a purchase."""
    item = db.get(Item, data.item_id)
    if not item or item.kind != "vehicle":
        raise HTTPException(400, "Select a vehicle model")
    if db.scalar(select(VehicleUnit).where(VehicleUnit.chassis_no == data.chassis_no)):
        raise HTTPException(400, f"Chassis {data.chassis_no} already exists")
    u = VehicleUnit(item_id=item.id, cost=data.cost or item.cost_price,
                    **data.model_dump(exclude={"item_id", "cost"}))
    db.add(u)
    recount_vehicle_stock(db, item.id)
    db.flush()
    audit(db, user, "opening-stock", "vehicle", u.id, f"{item.name} · {u.chassis_no}")
    db.commit()
    return unit_out(db, u)


@router.put("/{uid}")
def update_unit(uid: int, data: UnitUpdateIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    u = load(db, uid, user)
    for k, v in data.model_dump().items():
        setattr(u, k, "".join(v.upper().split()) if isinstance(v, str) and k != "color" else v)
    audit(db, user, "update", "vehicle", u.id, u.chassis_no)
    db.commit()
    return unit_out(db, u, True)


@router.delete("/{uid}", status_code=204)
def delete_unit(uid: int, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    u = load(db, uid, user)
    if u.status != "in_stock" or u.purchase_id:
        raise HTTPException(400, "Only manually added showroom stock can be deleted. Cancel the purchase instead.")
    audit(db, user, "delete", "vehicle", u.id, u.chassis_no)
    item_id = u.item_id
    db.delete(u)
    recount_vehicle_stock(db, item_id)
    db.commit()


@router.post("/{uid}/retail")
def mark_retailed(uid: int, data: RetailIn, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin", "manager", "subdealer"))):
    """Sub-dealer reports the retail sale of a vehicle they hold."""
    u = load(db, uid, user)
    if u.status != "with_subdealer":
        raise HTTPException(400, "Only vehicles held by a sub-dealer can be marked as retailed")
    u.status, u.retail_customer, u.retail_phone = "sold", data.customer_name, data.phone
    u.sold_on = data.date or date.today()
    audit(db, user, "retail", "vehicle", u.id, f"{u.chassis_no} → {data.customer_name}")
    db.commit()
    return unit_out(db, u, True)


@router.post("/{uid}/undo-retail")
def undo_retail(uid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    u = load(db, uid, user)
    if u.status != "sold" or not u.subdealer_id:
        raise HTTPException(400, "Nothing to undo")
    u.status, u.retail_customer, u.retail_phone, u.sold_on = "with_subdealer", None, None, None
    audit(db, user, "undo-retail", "vehicle", u.id, u.chassis_no)
    db.commit()
    return unit_out(db, u, True)
