"""Exportación PDF de planes semanales y diarios."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.services.planning_service import get_daily_plan_by_date, get_weekly_plan


def _pdf_safe(text: str) -> str:
    return text.encode("latin-1", errors="replace").decode("latin-1")


def export_weekly_plan_pdf(db: Session, plan_id: int) -> bytes:
    from fpdf import FPDF

    plan = get_weekly_plan(db, plan_id)
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _pdf_safe("FEROMAP - Plan semanal"), ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, _pdf_safe(f"Semana: {plan['weekStartDate']} — {plan['weekEndDate']}"), ln=True)
    pdf.cell(0, 8, _pdf_safe(f"Estado: {plan['status']} | Escenario: {plan['scenarioId']}"), ln=True)
    pdf.ln(4)

    for day in plan["days"]:
        pdf.set_font("Helvetica", "B", 11)
        override = day.get("scenarioIdOverride")
        override_label = f" | Escenario: {override}" if override else ""
        fleet = day.get("expectedVehicleCount")
        fleet_label = f" | Flota: {fleet}" if fleet else ""
        pdf.cell(
            0,
            8,
            _pdf_safe(
                f"{day['operationDate']} — {len(day['collectionPointIds'])} puntos{fleet_label}{override_label}"
            ),
            ln=True,
        )
        pdf.set_font("Helvetica", "", 9)
        if day["collectionPointIds"]:
            pdf.multi_cell(0, 5, _pdf_safe("Puntos: " + ", ".join(str(pid) for pid in day["collectionPointIds"])))
        pdf.ln(2)

    return bytes(pdf.output(dest="S"))


def export_daily_plan_pdf(db: Session, daily_plan_id: int) -> bytes:
    from fpdf import FPDF

    from app.db.models import DailyPlan

    plan_row = db.get(DailyPlan, daily_plan_id)
    if plan_row is None:
        raise ValueError("Plan del día no encontrado")
    plan: dict[str, Any] = get_daily_plan_by_date(db, plan_row.operation_date)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _pdf_safe("FEROMAP - Ordenes del dia"), ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, _pdf_safe(f"Fecha: {plan['operationDate']} | Estado: {plan['status']}"), ln=True)
    pdf.cell(0, 8, _pdf_safe(f"Escenario: {plan['scenarioId']} | Puntos finales: {len(plan['finalPointIds'])}"), ln=True)
    pdf.cell(
        0,
        8,
        _pdf_safe(f"Generado: {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}"),
        ln=True,
    )
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _pdf_safe("Programados"), ln=True)
    pdf.set_font("Helvetica", "", 9)
    for point in plan["scheduledPoints"]:
        pdf.cell(0, 5, _pdf_safe(f"- {point['code']} ({point.get('sectorName') or '—'})"), ln=True)

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _pdf_safe("Pendientes incorporados"), ln=True)
    pdf.set_font("Helvetica", "", 9)
    for visit in plan["pendingPoints"]:
        pdf.cell(
            0,
            5,
            _pdf_safe(
                f"- {visit.get('code') or visit['collectionPointId']} "
                f"(origen {visit['originOperationDate']}, prioridad {visit['priority']})"
            ),
            ln=True,
        )

    return bytes(pdf.output(dest="S"))
