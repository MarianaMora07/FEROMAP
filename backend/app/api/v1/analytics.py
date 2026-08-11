from fastapi import APIRouter, Query

from app.api.deps import DbSession, PlannerOrAdmin
from app.services.analytics_filters import build_filters
from app.services.analytics_service import analytics_heatmap, analytics_summary
from app.services.planning_analytics_service import planning_analytics_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def get_analytics_summary(
    db: DbSession,
    _user: PlannerOrAdmin,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    granularity: str | None = Query("daily"),
    sector: str | None = Query(None),
):
    filters = build_filters(
        from_date=from_date,
        to_date=to_date,
        granularity=granularity,
        sector=sector,
    )
    return analytics_summary(db, filters)


@router.get("/heatmap")
def get_analytics_heatmap(
    db: DbSession,
    _user: PlannerOrAdmin,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    sector: str | None = Query(None),
):
    filters = build_filters(from_date=from_date, to_date=to_date, sector=sector)
    return analytics_heatmap(db, filters)


@router.get("/planning")
def get_planning_analytics(
    db: DbSession,
    _user: PlannerOrAdmin,
    week_from: str | None = Query(None, alias="weekFrom"),
    week_to: str | None = Query(None, alias="weekTo"),
):
    from datetime import date

    parsed_from = date.fromisoformat(week_from) if week_from else None
    parsed_to = date.fromisoformat(week_to) if week_to else None
    return planning_analytics_summary(db, week_from=parsed_from, week_to=parsed_to)
