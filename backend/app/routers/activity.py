from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditLog
from ..security import require_roles

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
def activity(q: str = "", entity: str = "", action: str = "", user_id: int | None = None,
             date_from: date | None = None, date_to: date | None = None, limit: int = 50, offset: int = 0,
             db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    """Complete audit trail, administrator only."""
    stmt = select(AuditLog)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if q:
        stmt = stmt.where(or_(AuditLog.detail.ilike(f"%{q}%"), AuditLog.user_name.ilike(f"%{q}%")))
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at < date_to + timedelta(days=1))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).offset(offset).limit(min(limit, 200)))
    return {"total": total, "items": [{"id": a.id, "user_id": a.user_id, "user_name": a.user_name, "action": a.action,
                                       "entity": a.entity, "entity_id": a.entity_id, "detail": a.detail,
                                       "created_at": a.created_at.isoformat()} for a in rows]}
