from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.deps import DbSession, PlannerOrAdmin
from app.services.reports_service import export_simulations_csv, export_simulations_pdf, reports_summary

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
def get_reports_summary(db: DbSession, _user: PlannerOrAdmin):
    return reports_summary(db)


@router.get("/export")
def export_report(
    db: DbSession,
    _user: PlannerOrAdmin,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
):
    if format == "pdf":
        content = export_simulations_pdf(db)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="feromap-simulaciones.pdf"'},
        )
    csv_content = export_simulations_csv(db)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="feromap-simulaciones.csv"'},
    )
