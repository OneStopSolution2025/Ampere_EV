from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import BusinessIn
from ..security import EVERYONE, require_roles
from ..services import get_business

router = APIRouter(prefix="/settings", tags=["settings"])

FIELDS = list(BusinessIn.model_fields.keys())


@router.get("")
def get_settings(db: Session = Depends(get_db), _=Depends(require_roles(*EVERYONE))):
    biz = get_business(db)
    db.commit()
    return {k: getattr(biz, k) for k in FIELDS}


@router.put("")
def update_settings(data: BusinessIn, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    biz = get_business(db)
    for k, v in data.model_dump().items():
        setattr(biz, k, v)
    db.commit()
    return {k: getattr(biz, k) for k in FIELDS}
