from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Customer, Invoice, JobCard, Vehicle
from ..schemas import CustomerIn, VehicleIn
from ..security import MGMT, STAFF, require_roles

router = APIRouter(prefix="/customers", tags=["customers"])
vrouter = APIRouter(prefix="/vehicles", tags=["vehicles"])


def vehicle_out(v: Vehicle) -> dict:
    return {
        "id": v.id, "customer_id": v.customer_id, "reg_no": v.reg_no, "make": v.make, "model": v.model,
        "variant": v.variant, "color": v.color, "fuel_type": v.fuel_type, "year": v.year, "vin": v.vin,
        "motor_no": v.motor_no, "battery_no": v.battery_no, "odometer": v.odometer,
        "sold_on": v.sold_on.isoformat() if v.sold_on else None,
        "label": v.reg_no or (f"Chassis …{v.vin[-6:]}" if v.vin else "Vehicle"),
    }


def customer_out(c: Customer) -> dict:
    return {
        "id": c.id, "name": c.name, "phone": c.phone, "email": c.email, "address": c.address,
        "gstin": c.gstin, "state": c.state, "created_at": c.created_at.isoformat(),
        "vehicles": [vehicle_out(v) for v in c.vehicles],
    }


def ensure_unique_reg(db: Session, reg_no: str | None, exclude_id: int | None = None):
    if not reg_no:
        return
    stmt = select(Vehicle).where(Vehicle.reg_no == reg_no)
    if exclude_id:
        stmt = stmt.where(Vehicle.id != exclude_id)
    if db.scalar(stmt):
        raise HTTPException(400, f"Vehicle {reg_no} is already registered")


@router.get("")
def list_customers(q: str = "", limit: int = 100, offset: int = 0, db: Session = Depends(get_db),
                   _=Depends(require_roles(*STAFF))):
    stmt = select(Customer).options(selectinload(Customer.vehicles))
    if q:
        like = f"%{q.strip()}%"
        key = f"%{''.join(q.upper().split())}%"
        ids = select(Vehicle.customer_id).where(or_(Vehicle.reg_no.ilike(key), Vehicle.vin.ilike(key)))
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.phone.ilike(like), Customer.id.in_(ids)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Customer.name).offset(offset).limit(min(limit, 500))).all()
    return {"total": total, "items": [customer_out(c) for c in rows]}


@router.post("", status_code=201)
def create_customer(data: CustomerIn, db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    if data.phone and db.scalar(select(Customer).where(Customer.phone == data.phone.strip())):
        raise HTTPException(400, "A customer with this phone number already exists")
    c = Customer(**data.model_dump(exclude={"vehicles"}))
    for v in data.vehicles:
        ensure_unique_reg(db, v.reg_no)
        c.vehicles.append(Vehicle(**v.model_dump()))
    db.add(c)
    db.commit()
    return customer_out(c)


@router.get("/{cid}")
def get_customer(cid: int, db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "Customer not found")
    invs = db.scalars(select(Invoice).where(Invoice.customer_id == cid).order_by(Invoice.id.desc()).limit(50)).all()
    jobs = db.scalars(select(JobCard).where(JobCard.customer_id == cid).order_by(JobCard.id.desc()).limit(50)).all()
    out = customer_out(c)
    out["invoices"] = [
        {"id": i.id, "number": i.number, "doc_type": i.doc_type, "category": i.category, "date": i.date.isoformat(), "total": i.total,
         "paid": i.paid, "status": i.status} for i in invs
    ]
    out["jobcards"] = [
        {"id": j.id, "number": j.number, "status": j.status, "created_at": j.created_at.isoformat(),
         "vehicle": j.vehicle.reg_no or j.vehicle.vin} for j in jobs
    ]
    out["outstanding"] = round(sum(i.total - i.paid for i in invs if i.doc_type == "invoice" and i.status in ("unpaid", "partial")), 2)
    out["lifetime_value"] = round(sum(i.total for i in invs if i.doc_type == "invoice" and i.status != "cancelled"), 2)
    return out


@router.put("/{cid}")
def update_customer(cid: int, data: CustomerIn, db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "Customer not found")
    if data.phone and db.scalar(select(Customer).where(Customer.phone == data.phone.strip(), Customer.id != cid)):
        raise HTTPException(400, "A customer with this phone number already exists")
    for k, v in data.model_dump(exclude={"vehicles"}).items():
        setattr(c, k, v)
    db.commit()
    return customer_out(c)


@router.delete("/{cid}", status_code=204)
def delete_customer(cid: int, db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    c = db.get(Customer, cid)
    if not c:
        raise HTTPException(404, "Customer not found")
    if db.scalar(select(func.count()).select_from(Invoice).where(Invoice.customer_id == cid)) or \
            db.scalar(select(func.count()).select_from(JobCard).where(JobCard.customer_id == cid)):
        raise HTTPException(400, "This customer has bills or job cards and cannot be deleted")
    db.delete(c)
    db.commit()


@router.post("/{cid}/vehicles", status_code=201)
def add_vehicle(cid: int, data: VehicleIn, db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    if not db.get(Customer, cid):
        raise HTTPException(404, "Customer not found")
    ensure_unique_reg(db, data.reg_no)
    v = Vehicle(customer_id=cid, **data.model_dump())
    db.add(v)
    db.commit()
    return vehicle_out(v)


@vrouter.get("")
def search_vehicles(q: str = "", db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    stmt = select(Vehicle).order_by(Vehicle.reg_no).limit(20)
    if q:
        key = f"%{''.join(q.upper().split())}%"
        stmt = stmt.where(or_(Vehicle.reg_no.ilike(key), Vehicle.vin.ilike(key)))
    return [vehicle_out(v) | {"customer_name": v.customer.name, "customer_phone": v.customer.phone}
            for v in db.scalars(stmt)]


@vrouter.put("/{vid}")
def update_vehicle(vid: int, data: VehicleIn, db: Session = Depends(get_db), _=Depends(require_roles(*STAFF))):
    v = db.get(Vehicle, vid)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    ensure_unique_reg(db, data.reg_no, vid)
    for k, val in data.model_dump().items():
        setattr(v, k, val)
    db.commit()
    return vehicle_out(v)


@vrouter.delete("/{vid}", status_code=204)
def delete_vehicle(vid: int, db: Session = Depends(get_db), _=Depends(require_roles(*MGMT))):
    v = db.get(Vehicle, vid)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if db.scalar(select(func.count()).select_from(JobCard).where(JobCard.vehicle_id == vid)) or \
            db.scalar(select(func.count()).select_from(Invoice).where(Invoice.vehicle_id == vid)):
        raise HTTPException(400, "This vehicle has service history and cannot be deleted")
    db.delete(v)
    db.commit()
