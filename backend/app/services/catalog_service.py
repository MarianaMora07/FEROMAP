from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CollectionPoint, User, UserRole, Vehicle
from app.services.geo_service import fill_level_pct
from app.services.map_context_service import map_operational_context
from app.services.alert_service import list_alerts as list_persisted_alerts
from app.services.operations_service import active_routes_view, live_fleet_view
from app.services.seed_loader import load_seed


def list_alerts(db: Session) -> list[dict[str, Any]]:
    return list_persisted_alerts(db, active_only=True)


def monitoring_status(db: Session, *, current_user: User | None = None) -> dict[str, Any]:
    data = load_seed("monitoring.json")
    vehicles = db.scalars(select(Vehicle)).all()
    in_route = sum(1 for v in vehicles if v.status == "in_route")
    total = len(vehicles) or 1
    points = db.scalars(select(CollectionPoint)).all()
    emptied = sum(1 for p in points if float(p.current_fill_level_kg) == 0)
    critical = sum(
        1
        for p in points
        if p.max_capacity_kg > 0 and float(p.current_fill_level_kg / p.max_capacity_kg) >= 0.8
    )

    kpis = [
        {
            "id": "vehicles",
            "title": "Vehículos en ruta",
            "value": f"{in_route} / {total}",
            "progress": int(round(in_route / total * 100)),
            "iconTone": "blue",
            "icon": "truck",
        },
        {
            "id": "collections",
            "title": "Recolecciones hoy",
            "value": f"{emptied} / {len(points)}",
            "progress": int(round(emptied / max(len(points), 1) * 100)),
            "iconTone": "green",
            "icon": "trash",
        },
        {
            "id": "tons",
            "title": "Toneladas recolectadas",
            "value": f"{round(emptied * 0.12, 1)} t",
            "progress": min(100, int(emptied * 4)),
            "iconTone": "green",
            "icon": "scale",
        },
        {
            "id": "incidents",
            "title": "Incidencias activas",
            "value": str(critical),
            "linkLabel": "ver detalles",
            "iconTone": "red",
            "icon": "shield",
        },
        {
            "id": "drivers",
            "title": "Conductores conectados",
            "value": f"{in_route} / {max(in_route, 1)}",
            "progress": 100 if in_route else 0,
            "iconTone": "green",
            "icon": "user",
        },
    ]

    driver_id = _driver_filter(current_user)
    map_context = map_operational_context(db, driver_id=driver_id)
    live_fleet = map_context["vehicles"]
    if not live_fleet:
        live_fleet = data.get("liveFleet", [])

    route_progress = []
    for route in active_routes_view(db, driver_id=driver_id):
        route_progress.append(
            {
                "label": route["id"],
                "done": route.get("waypointsDone", 0),
                "total": route.get("waypointsTotal", 1),
                "pct": route["progress"],
                "color": "green" if route["progress"] >= 50 else "blue",
            }
        )

    monitoring_alerts = []
    for alert in list_persisted_alerts(db, active_only=True)[:4]:
        monitoring_alerts.append(
            {
                "title": alert["title"],
                "detail": f"{alert['source']} · {alert['detail']}",
                "time": alert["datetime"],
                "tone": "danger" if alert["priority"] == "critica" else "warning",
            }
        )

    return {
        "kpis": kpis,
        "liveFleet": live_fleet,
        "routeProgress": route_progress,
        "monitoringAlerts": monitoring_alerts,
        "fleetCounts": {
            "total": total,
            "inRoute": in_route,
            "available": sum(1 for v in vehicles if v.status == "available"),
            "maintenance": sum(1 for v in vehicles if v.status == "maintenance"),
            "inactive": sum(1 for v in vehicles if v.status == "inactive"),
        },
        "routes": map_context["routes"],
        "containers": map_context["containers"],
        "mapMetrics": map_context["mapMetrics"],
        "liveActivities": map_context["liveActivities"],
        "updatedAt": map_context["updatedAt"],
    }


def _driver_filter(current_user: User | None) -> int | None:
    if current_user is None or current_user.role != UserRole.conductor:
        return None
    if current_user.driver_profile is None:
        return -1
    return current_user.driver_profile.id
