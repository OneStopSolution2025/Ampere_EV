from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Subdealer, User
from ..schemas import UserIn
from ..security import ALL, hash_password, require_roles
from ..services import audit
from .auth import user_out

router = APIRouter(prefix="/users", tags=["users"])


def check_subdealer(db: Session, sid: int | None):
    if sid and not db.get(Subdealer, sid):
        raise HTTPException(400, "Sub-dealer not found")


@router.get("")
def list_users(db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.name))]


@router.get("/technicians")
def technicians(db: Session = Depends(get_db), _=Depends(require_roles(*ALL))):
    rows = db.scalars(select(User).where(User.role == "technician", User.is_active.is_(True)).order_by(User.name))
    return [{"id": u.id, "name": u.name} for u in rows]


@router.post("", status_code=201)
def create_user(data: UserIn, db: Session = Depends(get_db), me: User = Depends(require_roles("admin"))):
    if db.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(400, "A user with this email already exists")
    if not data.password or len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    check_subdealer(db, data.subdealer_id)
    u = User(name=data.name, email=data.email, phone=data.phone, role=data.role, is_active=data.is_active,
             subdealer_id=data.subdealer_id, password_hash=hash_password(data.password))
    db.add(u)
    db.flush()
    audit(db, me, "create", "user", u.id, f"{u.name} ({u.role})")
    db.commit()
    return user_out(u)


@router.put("/{uid}")
def update_user(uid: int, data: UserIn, db: Session = Depends(get_db), me: User = Depends(require_roles("admin"))):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    clash = db.scalar(select(User).where(User.email == data.email, User.id != uid))
    if clash:
        raise HTTPException(400, "A user with this email already exists")
    if u.id == me.id and (data.role != "admin" or not data.is_active):
        raise HTTPException(400, "You cannot remove your own admin access")
    check_subdealer(db, data.subdealer_id)
    u.name, u.email, u.phone, u.role, u.is_active = data.name, data.email, data.phone, data.role, data.is_active
    u.subdealer_id = data.subdealer_id
    if data.password:
        if len(data.password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        u.password_hash = hash_password(data.password)
    audit(db, me, "update", "user", u.id, f"{u.name} ({u.role}, {'active' if u.is_active else 'disabled'})")
    db.commit()
    return user_out(u)
