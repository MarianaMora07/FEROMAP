from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, Driver, OptimizedRoute, RouteWaypoint, Simulation, User, UserRole, Vehicle, Vehicle
from app.services.auth_service import role_label
from app.services.geo_service import fill_level_pct, fleet_summary, route_geojson, seed_meta_by_code
from app.services.alert_service import list_alerts as list_persisted_alerts
from app.services.operations_service import active_routes_view
from app.services.planning_analytics_service import planning_dashboard_snapshot
from app.services.optimization_service import run_optimization_engine
from app.services.scenario_utils import normalize_scenario_id
from app.services.seed_loader import load_seed
from app.services.simulation_parsing import parse_simulation


def _latest_optimization(db: Session) -> dict[str, Any] | None:
    simulation = db.scalars(
        select(Simulation).order_by(Simulation.executed_at.desc()).limit(1)
    ).first()
    if simulation is None or not simulation.parameters_json:
        return None
    params = json.loads(simulation.parameters_json)
    kpis = params.get("kpis")
    if not kpis:
        return None
    return {
        "simulationId": simulation.id,
        "scenarioName": simulation.scenario_name,
        "savingPercentage": float(simulation.kpi_saving_percentage or 0),
        "executedAt": simulation.executed_at.isoformat() if simulation.executed_at else None,
        "kpis": kpis,
    }


def _fleet_status_breakdown(db: Session) -> dict[str, Any]:
    vehicles = db.scalars(select(Vehicle)).all()
    total = len(vehicles) or 1
    active = sum(1 for v in vehicles if v.status in {"available", "in_route"})
    maintenance = sum(1 for v in vehicles if v.status == "maintenance")
    inactive = sum(1 for v in vehicles if v.status == "inactive")
    out_of_service = max(0, total - active - maintenance - inactive)
    items = [
        {"label": "Activos", "count": active, "pct": round(active / total * 100), "color": "#34D634"},
        {"label": "En mantenimiento", "count": maintenance, "pct": round(maintenance / total * 100), "color": "#1143F3"},
        {"label": "Fuera de servicio", "count": out_of_service, "pct": round(out_of_service / total * 100), "color": "#f59e0b"},
        {"label": "Inactivos", "count": inactive, "pct": round(inactive / total * 100), "color": "#94a3b8"},
    ]
    return {"total": total, "items": items}


def _weekly_tons_from_simulations(db: Session) -> dict[str, Any]:
    simulations = db.scalars(
        select(Simulation).order_by(Simulation.executed_at.desc()).limit(7)
    ).all()
    if not simulations:
        return {
            "labels": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
            "values": [18.0, 19.5, 20.1, 21.0, 22.4, 24.0, 25.0],
        }
    simulations = list(reversed(simulations))
    labels = []
    values = []
    for sim in simulations:
        label = sim.executed_at.strftime("%d %b") if sim.executed_at else "—"
        labels.append(label)
        optimized = float(sim.kpi_total_distance_optimized or 0)
        values.append(round(optimized * 0.45, 1))
    return {"labels": labels, "values": values}


def _recent_alerts_view(db: Session) -> list[dict[str, Any]]:
    alerts = list_persisted_alerts(db, active_only=True)[:3]
    tones = ["danger", "warning", "info"]
    return [
        {
            "title": alert["title"],
            "detail": f"{alert['source']} · {alert['location']}",
            "time": alert["datetime"].split(" ")[-2] + " " + alert["datetime"].split(" ")[-1]
            if " " in alert["datetime"]
            else alert["datetime"],
            "tone": tones[index % len(tones)],
        }
        for index, alert in enumerate(alerts)
    ]


def dashboard_summary(db: Session, *, current_user: User | None = None) -> dict[str, Any]:
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
    routes_in_progress = sum(
        1
        for r in db.scalars(
            select(OptimizedRoute).where(OptimizedRoute.status == "in_progress")
        ).all()
    )
    now = datetime.now(timezone.utc)

    if current_user is not None:
        greeting = f"¡Bienvenido/a, {current_user.first_name}!"
        user_block = {
            "name": f"{current_user.first_name} {current_user.last_name}",
            "role": role_label(current_user.role),
            "initials": f"{current_user.first_name[:1]}{current_user.last_name[:1]}".upper(),
        }
    else:
        greeting = "¡Bienvenida, Mariana!"
        user_block = {"name": "Mariana Mora", "role": "Administrador", "initials": "MM"}

    resident_schedule = None
    if current_user is not None and current_user.role == UserRole.residente and current_user.sector:
        resident_schedule = {
            "sectorName": current_user.sector.name,
            "collectionDays": "Lunes, miércoles y viernes",
            "nextCollection": "Próximo miércoles 07:00",
            "message": f"Horario de recolección en {current_user.sector.name}",
        }

    return {
        "greeting": greeting,
        "subtitle": "Resumen general del sistema de recolección de residuos.",
        "dateLabel": now.strftime("%d/%m/%Y"),
        "notifications": len(critical),
        "operatorsOnline": 12,
        "user": user_block,
        "residentSchedule": resident_schedule,
        "metrics": {
            "totalContainers": len(points),
            "criticalContainers": len(critical),
            "fullContainers": full_count,
            "activeVehicles": fleet["activeVehicles"],
            "routesInProgress": routes_in_progress,
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
                "value": routes_in_progress,
                "tone": "green",
                "icon": "route",
            },
        ],
        "lastOptimization": _latest_optimization(db),
        "fleetStatus": _fleet_status_breakdown(db),
        "activeRoutes": active_routes_view(db),
        "weeklyTons": _weekly_tons_from_simulations(db),
        "recentAlerts": _recent_alerts_view(db),
        "planningSnapshot": planning_dashboard_snapshot(db),
    }


def list_scenarios() -> list[dict[str, Any]]:
    return load_seed("scenarios.json")


def get_kpis(scenario_id: str) -> dict[str, Any]:
    normalized = normalize_scenario_id(scenario_id)
    kpis = load_seed("kpis.json")
    if normalized not in kpis:
        raise KeyError(normalized)
    return kpis[normalized]


def run_optimization(
    db: Session,
    scenario_id: str,
    *,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    estimated_duration_hours: int | None = None,
) -> dict[str, Any]:
    return run_optimization_engine(
        db,
        scenario_id,
        rain_intensity=rain_intensity,
        waste_level_pct=waste_level_pct,
        estimated_duration_hours=estimated_duration_hours,
    )


def list_simulations(db: Session, *, limit: int = 25, offset: int = 0) -> dict[str, Any]:
    simulations = db.scalars(
        select(Simulation)
        .order_by(Simulation.executed_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    total = db.scalar(select(func.count()).select_from(Simulation)) or 0
    items = []
    for simulation in simulations:
        parsed = parse_simulation(simulation)
        items.append(
            {
                "id": parsed["id"],
                "name": parsed["scenarioName"],
                "executedAt": parsed["executedAt"],
                "scenarioId": parsed["scenarioId"],
                "savingPercentage": parsed["savingPercentage"],
                "contingency": parsed["contingency"],
            }
        )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


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
