from fastapi import APIRouter

from app.api.deps import DbSession, OptionalUser
from app.services.dashboard_service import dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: DbSession, current_user: OptionalUser = None):
    return dashboard_summary(db, current_user=current_user)
