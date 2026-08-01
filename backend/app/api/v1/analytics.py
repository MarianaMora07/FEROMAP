from fastapi import APIRouter

from app.api.deps import DbSession, PlannerOrAdmin
from app.services.analytics_service import analytics_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def get_analytics_summary(db: DbSession, _user: PlannerOrAdmin):
    return analytics_summary(db)
