from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Item, StockMove, User
from ..schemas import ItemIn, StockAdjustIn
from ..security import ALL, MGMT, require_roles
from ..services import audit, r2

router = APIRouter(prefix="/items", tags=["inventory"])


def item_out(i: Item) -> dict:
    return {
        "id": i.id, "kind": i.kind, "name": i.name, "sku": i.sku, "brand": i.brand, "hsn_sac": i.hsn_sac,
        "unit": i.unit, "price": i.price, "cost_price": i.cost_price, "gst_rate": i.gst_rate, "stock": i.stock,
        "reorder_level": i.reorder_level, "is_active": i.is_active,
        "low_stock": i.kind in ("part", "vehicle") and i.stock <= i.reorder_level,
    }


@router.get("")
def list_items(q: str = "", kind: str = "", low_stock: bool = False, include_inactive: bool = False,
               limit: int = 300, db: Session = Depends(get_db), _=Depends(require_roles(*ALL))):
    stmt = select(Item)
    if not include_inactive:
        stmt = stmt.where(Item.is_active.is_(True))
    if kind in ("part", "service", "vehicle"):
        stmt = stmt.where(Item.kind == kind)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Item.name.ilike(like), Item.sku.ilike(like), Item.brand.ilike(like)))
    if low_stock:
        stmt = stmt.where(Item.kind.in_(("part", "vehicle")), Item.stock <= Item.reorder_level)
    return [item_out(i) for i in db.scalars(stmt.order_by(Item.name).limit(min(limit, 1000)))]


@router.post("", status_code=201)
def create_item(data: ItemIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    if data.sku and db.scalar(select(Item).where(Item.sku == data.sku)):
        raise HTTPException(400, "An item with this SKU already exists")
    i = Item(**data.model_dump())
    if i.kind == "service":
        i.stock = 0
        i.reorder_level = 0
    if i.kind == "vehicle":
        i.stock = 0  # vehicle stock comes from chassis-wise units
    db.add(i)
    db.flush()
    if i.kind == "part" and i.stock:
        db.add(StockMove(item_id=i.id, qty=i.stock, reason="opening", reference="Opening stock", user_id=user.id))
    audit(db, user, "create", "item", i.id, f"{i.kind}: {i.name}")
    db.commit()
    return item_out(i)


@router.put("/{iid}")
def update_item(iid: int, data: ItemIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    i = db.get(Item, iid)
    if not i:
        raise HTTPException(404, "Item not found")
    if data.sku and db.scalar(select(Item).where(Item.sku == data.sku, Item.id != iid)):
        raise HTTPException(400, "An item with this SKU already exists")
    # Stock is changed only through stock adjustments to keep an audit trail.
    changes = [f"{k}: {getattr(i, k)} → {v}" for k, v in data.model_dump(exclude={"stock", "kind"}).items() if getattr(i, k) != v]
    for k, v in data.model_dump(exclude={"stock", "kind"}).items():
        setattr(i, k, v)
    if changes:
        audit(db, user, "update", "item", i.id, f"{i.name}: " + "; ".join(changes))
    db.commit()
    return item_out(i)


@router.delete("/{iid}", status_code=204)
def deactivate_item(iid: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*MGMT))):
    i = db.get(Item, iid)
    if not i:
        raise HTTPException(404, "Item not found")
    i.is_active = False
    audit(db, user, "deactivate", "item", i.id, i.name)
    db.commit()


@router.post("/{iid}/stock")
def adjust_stock(iid: int, data: StockAdjustIn, db: Session = Depends(get_db),
                 user: User = Depends(require_roles(*MGMT))):
    i = db.get(Item, iid)
    if not i or i.kind != "part":
        raise HTTPException(404, "Part not found")
    if data.qty == 0:
        raise HTTPException(400, "Quantity cannot be zero")
    i.stock = r2(i.stock + data.qty)
    db.add(StockMove(item_id=i.id, qty=data.qty, reason=data.reason, reference=data.reference, user_id=user.id))
    audit(db, user, "stock", "item", i.id, f"{i.name}: {data.qty:+g} ({data.reason})")
    db.commit()
    return item_out(i)


@router.get("/{iid}/moves")
def stock_moves(iid: int, db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    rows = db.scalars(select(StockMove).where(StockMove.item_id == iid).order_by(StockMove.id.desc()).limit(200))
    return [{"id": m.id, "qty": m.qty, "reason": m.reason, "reference": m.reference,
             "created_at": m.created_at.isoformat()} for m in rows]
