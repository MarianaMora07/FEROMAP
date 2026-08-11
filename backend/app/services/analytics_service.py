from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from app.services.analytics_filters import AnalyticsFilters

from app.services.analytics_filters import (
    bucket_evolution_series,
    hourly_distribution_from_rows,
    load_simulation_rows,
)
from app.services.geo_service import collection_points_geojson


def analytics_summary(db: Session, filters: AnalyticsFilters | None = None) -> dict[str, Any]:
    filters = filters or AnalyticsFilters()
    rows = load_simulation_rows(db, filters)

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

    evolution = bucket_evolution_series(rows, filters.granularity)
    spark_distance = evolution["distanceKm"][-6:] or [1, 2, 3]
    spark_saving = evolution["savingPct"][-6:] or [10, 15, 20]

    return {
        "kpis": [
            {
                "id": "simulations",
                "title": "Simulaciones registradas",
                "value": str(len(rows)),
                "icon": "route",
                "iconTone": "blue",
                "sparkline": spark_distance,
            },
            {
                "id": "saving",
                "title": "Ahorro promedio",
                "value": f"{avg_saving:.1f}%",
                "icon": "leaf",
                "iconTone": "green",
                "sparkline": spark_saving,
            },
            {
                "id": "distance",
                "title": "Distancia acumulada",
                "value": f"{total_distance:.0f} km",
                "icon": "truck",
                "iconTone": "amber",
                "sparkline": spark_distance,
            },
            {
                "id": "containers",
                "title": "Contenedores atendidos",
                "value": str(total_containers),
                "icon": "trash",
                "iconTone": "green",
                "sparkline": evolution["collections"][-6:] or [0],
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
        "hourlyDistribution": hourly_distribution_from_rows(rows),
        "routePerformance": [
            {
                "id": f"r{r['id']}",
                "label": r["scenarioName"][:20],
                "tons": round(float(r["containersServed"] or 0) * 0.12, 1),
                "efficiency": min(100, int(r["savingPercentage"])),
                "distanceKm": round(r["distanceOptimizedKm"], 1),
            }
            for r in sorted(rows, key=lambda row: row["distanceOptimizedKm"], reverse=True)[:6]
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
        "evolutionSeries": evolution,
        "filters": {
            "from": filters.date_from.isoformat() if filters.date_from else None,
            "to": filters.date_to.isoformat() if filters.date_to else None,
            "granularity": filters.granularity,
            "sector": filters.sector,
        },
    }


def analytics_heatmap(db: Session, filters: AnalyticsFilters | None = None) -> dict[str, Any]:
    filters = filters or AnalyticsFilters()
    rows = load_simulation_rows(db, filters)
    activity_scale = min(1.5, 0.5 + len(rows) / 20) if rows else 0.75

    geo = collection_points_geojson(db, sector=filters.sector)
    features = []
    for feature in geo.get("features", []):
        fill_level = int(feature.get("properties", {}).get("fillLevel", 0))
        weight = round((fill_level / 100) * activity_scale, 2)
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "weight": weight,
                    "fillLevel": fill_level,
                    "sector": feature.get("properties", {}).get("sector"),
                },
                "geometry": feature["geometry"],
            }
        )
    return {"type": "FeatureCollection", "features": features}


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
        "filters": {},
    }
