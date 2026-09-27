from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.services.resident_proximity_service import build_resident_proximity
from app.services.resident_service import resident_overview

router = APIRouter(prefix="/resident", tags=["resident"])


@router.get("/overview")
def get_resident_overview(db: DbSession, current_user: CurrentUser):
    return resident_overview(db, current_user)


@router.get("/proximity")
def get_resident_proximity(db: DbSession, current_user: CurrentUser):
    return build_resident_proximity(db, current_user)
