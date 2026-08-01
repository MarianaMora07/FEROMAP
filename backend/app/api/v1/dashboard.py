from fastapi import APIRouter

from app.api.deps import DbSession
from app.services.dashboard_service import dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: DbSession):
    return dashboard_summary(db)
