from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, Simulation, Vehicle
from app.services.geo_service import fill_level_pct, fleet_summary, route_geojson, seed_meta_by_code
from app.services.optimization_service import run_optimization_engine
from app.services.scenario_utils import normalize_scenario_id
from app.services.seed_loader import load_seed


def dashboard_summary(db: Session) -> dict[str, Any]:
    points = db.scalars(
        select(CollectionPoint).options(joinedload(CollectionPoint.sector)).order_by(CollectionPoint.code)
    ).all()
    meta_by_code = seed_meta_by_code()
    critical = []
    full_count = 0
    for point in points:
        pct = fill_level_pct(point)
        if pct >= 80:
            meta = meta_by_code.get(point.code, {})
            critical.append(
                {
                    "id": point.code,
                    "sector": point.sector.name if point.sector else "",
                    "fillLevel": pct,
                    "priority": meta.get("priority", "critica"),
                }
            )
        if pct >= 60:
            full_count += 1

    sector_fill: dict[str, list[int]] = {}
    for point in points:
        name = point.sector.name if point.sector else "Desconocido"
        sector_fill.setdefault(name, []).append(fill_level_pct(point))
    sector_fill_levels = [
        {"name": name, "pct": round(sum(values) / len(values))}
        for name, values in sorted(sector_fill.items())
    ]

    fleet = fleet_summary(db)
    vehicles = db.scalars(select(Vehicle)).all()
    routes_in_progress = sum(1 for v in vehicles if v.status == "in_route")
    now = datetime.now(timezone.utc)

    return {
        "greeting": "¡Bienvenida, Mariana!",
        "subtitle": "Resumen general del sistema de recolección de residuos.",
        "dateLabel": now.strftime("%d/%m/%Y"),
        "notifications": len(critical),
        "operatorsOnline": 12,
        "user": {"name": "Mariana Mora", "role": "Administrador", "initials": "MM"},
        "metrics": {
            "totalContainers": len(points),
            "criticalContainers": len(critical),
            "fullContainers": full_count,
            "activeVehicles": fleet["activeVehicles"],
            "routesInProgress": max(routes_in_progress, 1),
        },
        "fleet": fleet,
        "criticalContainerList": critical,
        "sectorFillLevels": sector_fill_levels,
        "mapMetrics": [
            {"id": "total", "label": "Contenedores totales", "value": len(points), "tone": "green", "icon": "trash"},
            {
                "id": "critical",
                "label": "Contenedores críticos",
                "value": len(critical),
                "tone": "red",
                "icon": "trash",
            },
            {"id": "full", "label": "Contenedores llenos", "value": full_count, "tone": "amber", "icon": "trash"},
            {
                "id": "vehicles",
                "label": "Vehículos activos",
                "value": fleet["activeVehicles"],
                "tone": "blue",
                "icon": "truck",
            },
            {
                "id": "routes",
                "label": "Rutas en ejecución",
                "value": max(routes_in_progress, 1),
                "tone": "green",
                "icon": "route",
            },
        ],
    }


def list_scenarios() -> list[dict[str, Any]]:
    return load_seed("scenarios.json")


def get_kpis(scenario_id: str) -> dict[str, Any]:
    normalized = normalize_scenario_id(scenario_id)
    kpis = load_seed("kpis.json")
    if normalized not in kpis:
        raise KeyError(normalized)
    return kpis[normalized]


def run_optimization(db: Session, scenario_id: str) -> dict[str, Any]:
    return run_optimization_engine(db, scenario_id)


def simulation_detail(db: Session, simulation_id: int) -> dict[str, Any]:
    simulation = db.get(Simulation, simulation_id)
    if simulation is None:
        raise LookupError("Simulación no encontrada")

    params: dict[str, Any] = {}
    if simulation.parameters_json:
        params = json.loads(simulation.parameters_json)
    scenario_id = params.get("scenarioId", "normal")
    kpi = params.get("kpis") or get_kpis(scenario_id)
    routes = params.get("routesGeojson") or {
        "current": route_geojson(db, "current"),
        "optimized": route_geojson(db, "optimized"),
    }

    return {
        "id": simulation.id,
        "executedAt": simulation.executed_at.isoformat() if simulation.executed_at else None,
        "scenarioId": scenario_id,
        "scenarioName": simulation.scenario_name,
        "parameters": params,
        "kpis": kpi,
        "kpiTotalDistanceHistorical": float(simulation.kpi_total_distance_historical or 0),
        "kpiTotalDistanceOptimized": float(simulation.kpi_total_distance_optimized or 0),
        "kpiSavingPercentage": float(simulation.kpi_saving_percentage or 0),
        "routes": routes,
    }
