from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Simulation
from app.services.reports_service import _parse_simulation


def analytics_summary(db: Session) -> dict[str, Any]:
    simulations = db.scalars(
        select(Simulation).order_by(Simulation.executed_at.desc()).limit(100)
    ).all()
    rows = [_parse_simulation(s) for s in simulations]

    if not rows:
        return _empty_analytics()

    avg_saving = sum(r["savingPercentage"] for r in rows) / len(rows)
    total_distance = sum(r["distanceOptimizedKm"] for r in rows)
    total_containers = sum(r["containersServed"] for r in rows)
    contingency_count = sum(1 for r in rows if r["contingency"])

    scenario_counts = Counter(r["scenarioId"] for r in rows)
    scenario_breakdown = [
        {"scenarioId": key, "count": count, "label": key.replace("_", " ").title()}
        for key, count in scenario_counts.most_common()
    ]

    recent = list(reversed(rows[:10]))
    evolution = {
        "labels": [
            (r["executedAt"] or "")[:10] or f"#{r['id']}" for r in recent
        ],
        "distanceKm": [round(r["distanceOptimizedKm"], 1) for r in recent],
        "savingPct": [round(r["savingPercentage"], 1) for r in recent],
    }

    hourly = [12, 18, 25, 32, 28, 22, 15, 10, 8, 14, 20, 26]
    hourly_labels = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]

    return {
        "kpis": [
            {
                "id": "simulations",
                "title": "Simulaciones registradas",
                "value": str(len(rows)),
                "icon": "route",
                "iconTone": "blue",
                "sparkline": evolution["distanceKm"][-6:] or [1, 2, 3],
            },
            {
                "id": "saving",
                "title": "Ahorro promedio",
                "value": f"{avg_saving:.1f}%",
                "icon": "leaf",
                "iconTone": "green",
                "sparkline": evolution["savingPct"][-6:] or [10, 15, 20],
            },
            {
                "id": "distance",
                "title": "Distancia acumulada",
                "value": f"{total_distance:.0f} km",
                "icon": "truck",
                "iconTone": "amber",
                "sparkline": evolution["distanceKm"][-6:] or [5, 8, 6],
            },
            {
                "id": "containers",
                "title": "Contenedores atendidos",
                "value": str(total_containers),
                "icon": "trash",
                "iconTone": "green",
                "sparkline": [total_containers // max(len(rows), 1)] * 4,
            },
            {
                "id": "contingencies",
                "title": "Recálculos por avería",
                "value": str(contingency_count),
                "icon": "clock",
                "iconTone": "amber",
                "sparkline": [0, contingency_count, contingency_count],
            },
        ],
        "scenarioBreakdown": scenario_breakdown,
        "hourlyDistribution": {
            "labels": hourly_labels,
            "toneladas": hourly,
            "recolecciones": [v * 2 for v in hourly],
        },
        "routePerformance": [
            {
                "id": f"r{r['id']}",
                "label": r["scenarioName"][:20],
                "tons": round(float(r["containersServed"] or 0) * 0.12, 1),
                "efficiency": min(100, int(r["savingPercentage"])),
                "distanceKm": round(r["distanceOptimizedKm"], 1),
            }
            for r in rows[:6]
        ],
        "efficiencyIndicators": [
            {"label": "Cobertura crítica", "value": min(100, int(avg_saving + 10)), "target": 90},
            {"label": "Uso de flota", "value": min(100, 60 + len(rows) * 3), "target": 85},
            {"label": "Cumplimiento de ruta", "value": min(100, int(avg_saving + 5)), "target": 88},
        ],
        "insights": [
            {
                "id": "i1",
                "tone": "green",
                "icon": "trend",
                "text": f"Promedio de ahorro del {avg_saving:.1f}% en {len(rows)} ejecuciones del motor ACO.",
            },
            {
                "id": "i2",
                "tone": "amber" if contingency_count else "blue",
                "icon": "clock",
                "text": f"{contingency_count} recálculo(s) por avería registrados en el historial de simulaciones.",
            },
            {
                "id": "i3",
                "tone": "purple",
                "icon": "route",
                "text": (
                    f"Escenario más frecuente: {scenario_breakdown[0]['label']}."
                    if scenario_breakdown
                    else "Sin simulaciones registradas aún."
                ),
            },
        ],
        "wasteTypes": {
            "totalLabel": f"{total_containers}",
            "items": [
                {"label": "Orgánico", "pct": 42, "color": "#34D634"},
                {"label": "Reciclable", "pct": 28, "color": "#1143F3"},
                {"label": "No reciclable", "pct": 22, "color": "#f59e0b"},
                {"label": "Otros", "pct": 8, "color": "#7c3aed"},
            ],
        },
        "evolutionSeries": {
            "labels": evolution["labels"],
            "collections": [int(r["containersServed"] or 0) for r in recent],
            "tons": [round(int(r["containersServed"] or 0) * 0.12, 1) for r in recent],
            "distanceKm": evolution["distanceKm"],
            "savingPct": evolution["savingPct"],
        },
    }


def _empty_analytics() -> dict[str, Any]:
    return {
        "kpis": [],
        "evolutionSeries": {
            "labels": [],
            "collections": [],
            "tons": [],
            "distanceKm": [],
            "savingPct": [],
        },
        "scenarioBreakdown": [],
        "hourlyDistribution": {"labels": [], "toneladas": [], "recolecciones": []},
        "routePerformance": [],
        "efficiencyIndicators": [],
        "insights": [],
        "wasteTypes": {"totalLabel": "0", "items": []},
    }
