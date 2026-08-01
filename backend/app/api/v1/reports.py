from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.deps import DbSession, PlannerOrAdmin
from app.services.analytics_filters import build_filters
from app.services.reports_service import export_simulations_csv, export_simulations_pdf, reports_summary

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
def get_reports_summary(
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
    return reports_summary(db, filters)


@router.get("/export")
def export_report(
    db: DbSession,
    _user: PlannerOrAdmin,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
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
    if format == "pdf":
        content = export_simulations_pdf(db, filters)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="feromap-simulaciones.pdf"'},
        )
    csv_content = export_simulations_csv(db, filters)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="feromap-simulaciones.csv"'},
    )
