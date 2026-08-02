from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Simulation
from app.services.analytics_filters import (
    AnalyticsFilters,
    bucket_evolution_series,
    filtered_simulations_stmt,
    load_simulation_rows,
)


def _parse_simulation(sim: Simulation) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if sim.parameters_json:
        params = json.loads(sim.parameters_json)
    kpis = params.get("kpis") or {}
    return {
        "id": sim.id,
        "executedAt": sim.executed_at.isoformat() if sim.executed_at else None,
        "scenarioName": sim.scenario_name,
        "scenarioId": params.get("scenarioId", "normal"),
        "distanceHistoricalKm": float(sim.kpi_total_distance_historical or 0),
        "distanceOptimizedKm": float(sim.kpi_total_distance_optimized or 0),
        "savingPercentage": float(sim.kpi_saving_percentage or 0),
        "containersServed": kpis.get("containersServed", 0),
        "fuelLitersOptimized": (kpis.get("fuelLiters") or {}).get("optimized", 0),
        "contingency": bool(params.get("contingency")),
    }


def reports_summary(db: Session, filters: AnalyticsFilters | None = None) -> dict[str, Any]:
    filters = filters or AnalyticsFilters()
    rows = load_simulation_rows(db, filters)

    if not rows:
        return _empty_summary()

    recent_rows = list(reversed(rows))

    total_opt = sum(r["distanceOptimizedKm"] for r in rows)
    total_hist = sum(r["distanceHistoricalKm"] for r in rows)
    avg_saving = sum(r["savingPercentage"] for r in rows) / len(rows)
    total_containers = sum(r["containersServed"] for r in rows)
    total_fuel = sum(float(r["fuelLitersOptimized"] or 0) for r in rows)

    series = bucket_evolution_series(rows, filters.granularity)
    labels = series["labels"]
    collections = series["collections"]
    tons = series["tons"]
    distance = series["distanceKm"]
    efficiency = series["savingPct"]

    route_perf = []
    colors = ["#34D634", "#1143F3", "#7c3aed", "#f59e0b", "#ef4444"]
    for index, row in enumerate(recent_rows[:5]):
        route_perf.append(
            {
                "label": row["scenarioName"][:24],
                "tons": round(float(row["containersServed"] or 0) * 0.12, 1),
                "color": colors[index % len(colors)],
            }
        )

    prev = recent_rows[1] if len(recent_rows) > 1 else recent_rows[0]
    curr = recent_rows[0]
    period_comparison = [
        {
            "metric": "Distancia optimizada (km)",
            "current": f"{curr['distanceOptimizedKm']:.1f}",
            "previous": f"{prev['distanceOptimizedKm']:.1f}",
            "delta": _delta_pct(prev["distanceOptimizedKm"], curr["distanceOptimizedKm"]),
        },
        {
            "metric": "Ahorro (%)",
            "current": f"{curr['savingPercentage']:.1f}",
            "previous": f"{prev['savingPercentage']:.1f}",
            "delta": _delta_pct(prev["savingPercentage"], curr["savingPercentage"]),
        },
        {
            "metric": "Contenedores atendidos",
            "current": str(curr["containersServed"]),
            "previous": str(prev["containersServed"]),
            "delta": _delta_pct(prev["containersServed"], curr["containersServed"]),
        },
    ]

    saved_reports = [
        {
            "id": row["id"],
            "name": f"Simulación #{row['id']} — {row['scenarioName']}",
            "type": "Contingencia" if row["contingency"] else "Optimización",
            "period": row["executedAt"][:10] if row["executedAt"] else "—",
            "format": "csv",
            "generatedAt": row["executedAt"],
        }
        for row in recent_rows[:8]
    ]

    return {
        "kpis": [
            {
                "id": "collections",
                "title": "Recolecciones (simulaciones)",
                "value": str(total_containers),
                "icon": "trash",
                "iconTone": "green",
                "trend": min(99, int(avg_saving)),
            },
            {
                "id": "distance",
                "title": "Distancia optimizada",
                "value": f"{total_opt:.1f} km",
                "icon": "route",
                "iconTone": "blue",
                "trend": int(avg_saving),
            },
            {
                "id": "fuel",
                "title": "Combustible estimado",
                "value": f"{total_fuel:.0f} L",
                "icon": "truck",
                "iconTone": "amber",
                "trend": int(avg_saving),
            },
            {
                "id": "saving",
                "title": "Ahorro promedio",
                "value": f"{avg_saving:.1f}%",
                "icon": "leaf",
                "iconTone": "green",
                "trend": int(avg_saving),
            },
            {
                "id": "simulations",
                "title": "Simulaciones ejecutadas",
                "value": str(len(rows)),
                "icon": "clock",
                "iconTone": "blue",
                "trend": len(rows),
            },
        ],
        "performanceSeries": {
            "labels": labels,
            "collections": collections,
            "tons": tons,
            "distance": distance,
            "efficiency": efficiency,
        },
        "wasteTypeDistribution": {
            "totalLabel": f"{total_containers}",
            "items": [
                {"label": "Orgánico", "pct": 42, "color": "#34D634"},
                {"label": "Reciclable", "pct": 28, "color": "#1143F3"},
                {"label": "No reciclable", "pct": 22, "color": "#f59e0b"},
                {"label": "Otros", "pct": 8, "color": "#94a3b8"},
            ],
        },
        "routePerformance": route_perf,
        "periodComparison": period_comparison,
        "savedReports": saved_reports,
        "simulations": rows,
        "totals": {
            "distanceHistoricalKm": round(total_hist, 2),
            "distanceOptimizedKm": round(total_opt, 2),
            "avgSavingPct": round(avg_saving, 1),
        },
        "filters": {
            "from": filters.date_from.isoformat() if filters.date_from else None,
            "to": filters.date_to.isoformat() if filters.date_to else None,
            "granularity": filters.granularity,
            "sector": filters.sector,
        },
    }


def _delta_pct(previous: float, current: float) -> int:
    if previous == 0:
        return 0
    return int(round((current - previous) / previous * 100))


def _empty_summary() -> dict[str, Any]:
    return {
        "kpis": [],
        "performanceSeries": {"labels": [], "collections": [], "tons": [], "distance": [], "efficiency": []},
        "wasteTypeDistribution": {"totalLabel": "0", "items": []},
        "routePerformance": [],
        "periodComparison": [],
        "savedReports": [],
        "simulations": [],
        "totals": {"distanceHistoricalKm": 0, "distanceOptimizedKm": 0, "avgSavingPct": 0},
    }


def export_simulations_csv(db: Session, filters: AnalyticsFilters | None = None) -> str:
    filters = filters or AnalyticsFilters()
    simulations = db.scalars(filtered_simulations_stmt(filters)).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "executed_at",
            "scenario",
            "distance_historical_km",
            "distance_optimized_km",
            "saving_pct",
            "containers_served",
            "contingency",
        ]
    )
    for sim in simulations:
        row = _parse_simulation(sim)
        writer.writerow(
            [
                row["id"],
                row["executedAt"],
                row["scenarioName"],
                row["distanceHistoricalKm"],
                row["distanceOptimizedKm"],
                row["savingPercentage"],
                row["containersServed"],
                row["contingency"],
            ]
        )
    return buffer.getvalue()


def _pdf_safe(text: str) -> str:
    return text.encode("latin-1", errors="replace").decode("latin-1")


def export_simulations_pdf(db: Session, filters: AnalyticsFilters | None = None) -> bytes:
    from fpdf import FPDF

    summary = reports_summary(db, filters)
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "FEROMAP - Reporte de simulaciones", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, f"Generado: {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}", ln=True)
    pdf.ln(4)

    totals = summary["totals"]
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Resumen", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Simulaciones: {len(summary['simulations'])}", ln=True)
    pdf.cell(0, 6, f"Distancia optimizada total: {totals['distanceOptimizedKm']} km", ln=True)
    pdf.cell(0, 6, f"Ahorro promedio: {totals['avgSavingPct']}%", ln=True)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(12, 8, "ID", border=1)
    pdf.cell(40, 8, "Escenario", border=1)
    pdf.cell(35, 8, "Fecha", border=1)
    pdf.cell(25, 8, "Dist. opt.", border=1)
    pdf.cell(20, 8, "Ahorro%", border=1)
    pdf.cell(20, 8, "Puntos", border=1, ln=True)
    pdf.set_font("Helvetica", "", 9)

    for row in summary["simulations"][:25]:
        date_label = (row["executedAt"] or "")[:10]
        pdf.cell(12, 7, str(row["id"]), border=1)
        pdf.cell(40, 7, _pdf_safe(row["scenarioName"][:22]), border=1)
        pdf.cell(35, 7, date_label, border=1)
        pdf.cell(25, 7, f"{row['distanceOptimizedKm']:.1f}", border=1)
        pdf.cell(20, 7, f"{row['savingPercentage']:.1f}", border=1)
        pdf.cell(20, 7, str(row["containersServed"]), border=1, ln=True)

    return bytes(pdf.output())
