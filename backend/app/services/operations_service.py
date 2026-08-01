"""Despacho de rutas y avance operativo de waypoints."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Vehicle, VehicleIncident
from app.services.geo_service import fill_level_pct
from app.services.seed_loader import load_seed

VEHICLE_IMAGES = [
    "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=160&h=120&q=80",
    "https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=160&h=120&q=80",
    "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=160&h=120&q=80",
]

STATUS_TO_UI = {
    "in_route": "en-ruta",
    "available": "disponible",
    "maintenance": "mantenimiento",
    "inactive": "fuera-de-servicio",
}


def route_progress_percent(waypoints: list[RouteWaypoint]) -> int:
    if not waypoints:
        return 0
    completed = sum(1 for wp in waypoints if wp.status == "completed")
    return int(round(completed / len(waypoints) * 100))


def _next_pending_waypoint(db: Session, route_id: int) -> RouteWaypoint | None:
    return db.scalar(
        select(RouteWaypoint)
        .where(RouteWaypoint.route_id == route_id, RouteWaypoint.status == "pending")
        .order_by(RouteWaypoint.sequence_order)
        .limit(1)
    )


def dispatch_optimized_routes(
    db: Session,
    *,
    preserve_active: bool = False,
) -> dict[str, Any]:
    """Marca rutas optimizadas pendientes como en ejecución y asigna vehículos."""
    if not preserve_active:
        active = db.scalars(
            select(OptimizedRoute).where(
                OptimizedRoute.route_kind == "optimized",
                OptimizedRoute.status == "in_progress",
            )
        ).all()
        for route in active:
            route.status = "completed"
            vehicle = db.get(Vehicle, route.vehicle_id)
            if vehicle and vehicle.status == "in_route":
                vehicle.status = "available"

    pending = db.scalars(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status == "pending",
        )
        .order_by(OptimizedRoute.id.desc())
    ).all()

    if not pending:
        latest_calculated = db.scalar(
            select(OptimizedRoute.calculated_at)
            .where(OptimizedRoute.route_kind == "optimized")
            .order_by(OptimizedRoute.calculated_at.desc())
            .limit(1)
        )
        if latest_calculated:
            pending = list(
                db.scalars(
                    select(OptimizedRoute).where(
                        OptimizedRoute.route_kind == "optimized",
                        OptimizedRoute.status == "pending",
                        OptimizedRoute.calculated_at == latest_calculated,
                    )
                ).all()
            )

    dispatched_ids: list[int] = []
    for route in pending:
        route.status = "in_progress"
        vehicle = db.get(Vehicle, route.vehicle_id)
        if vehicle:
            vehicle.status = "in_route"
        dispatched_ids.append(route.id)

    return {"dispatchedRouteIds": dispatched_ids, "count": len(dispatched_ids)}


def advance_route(db: Session, route_id: int) -> dict[str, Any]:
    """Completa la siguiente parada pendiente de una ruta en ejecución."""
    route = db.scalar(
        select(OptimizedRoute)
        .where(OptimizedRoute.id == route_id)
        .options(
            joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
        )
    )
    if route is None:
        raise LookupError(f"Ruta no encontrada: {route_id}")
    if route.status != "in_progress":
        raise ValueError("La ruta no está en ejecución")

    waypoint = _next_pending_waypoint(db, route_id)
    if waypoint is None:
        route.status = "completed"
        vehicle = db.get(Vehicle, route.vehicle_id)
        if vehicle:
            vehicle.status = "available"
        return {
            "routeId": route_id,
            "routeCompleted": True,
            "progress": 100,
            "waypoint": None,
        }

    now = datetime.now(timezone.utc)
    waypoint.status = "completed"
    waypoint.actual_arrival_at = now

    point = waypoint.collection_point
    if point is not None:
        point.current_fill_level_kg = Decimal("0")
        point.last_emptied_at = now

    db.flush()
    progress = route_progress_percent(list(route.waypoints))
    return {
        "routeId": route_id,
        "routeCompleted": progress >= 100,
        "progress": progress,
        "waypoint": {
            "id": waypoint.id,
            "collectionPointCode": point.code if point else None,
            "sequenceOrder": waypoint.sequence_order,
            "actualArrivalAt": now.isoformat(),
        },
    }


def advance_active_routes(db: Session) -> dict[str, Any]:
    """Avanza una parada en cada ruta activa (simulación de progreso)."""
    routes = db.scalars(
        select(OptimizedRoute).where(OptimizedRoute.status == "in_progress")
    ).all()
    results = []
    for route in routes:
        try:
            results.append(advance_route(db, route.id))
        except ValueError:
            continue
    return {"advanced": len(results), "routes": results}


def active_routes_view(db: Session, *, driver_id: int | None = None) -> list[dict[str, Any]]:
    stmt = (
        select(OptimizedRoute)
        .where(OptimizedRoute.status == "in_progress")
        .options(
            joinedload(OptimizedRoute.vehicle),
            joinedload(OptimizedRoute.driver),
            joinedload(OptimizedRoute.waypoints),
        )
        .order_by(OptimizedRoute.id)
    )
    if driver_id is not None:
        if driver_id < 0:
            return []
        stmt = stmt.where(OptimizedRoute.driver_id == driver_id)
    routes = db.scalars(stmt).unique().all()
    seed_vehicles = {row["code"]: row for row in load_seed("vehicles.json")}
    items = []
    for route in routes:
        vehicle = route.vehicle
        driver = route.driver
        code = vehicle.code if vehicle else f"R-{route.id}"
        progress = route_progress_percent(list(route.waypoints))
        waypoints = list(route.waypoints)
        completed = sum(1 for wp in waypoints if wp.status == "completed")
        seed = seed_vehicles.get(code, {})
        items.append(
            {
                "id": f"Ruta {code}",
                "driver": f"{driver.first_name} {driver.last_name}" if driver else seed.get("driverName", "—"),
                "vehicle": code,
                "progress": progress,
                "tone": "success" if progress >= 50 else "info",
                "routeId": route.id,
                "waypointsDone": completed,
                "waypointsTotal": len(waypoints),
            }
        )
    return items


def live_fleet_view(db: Session, *, driver_id: int | None = None) -> list[dict[str, Any]]:
    stmt = (
        select(OptimizedRoute)
        .where(OptimizedRoute.status == "in_progress")
        .options(
            joinedload(OptimizedRoute.vehicle),
            joinedload(OptimizedRoute.driver),
            joinedload(OptimizedRoute.waypoints)
            .joinedload(RouteWaypoint.collection_point)
            .joinedload(CollectionPoint.sector),
        )
    )
    if driver_id is not None:
        if driver_id < 0:
            return []
        stmt = stmt.where(OptimizedRoute.driver_id == driver_id)
    routes = db.scalars(stmt).unique().all()
    seed_vehicles = {row["code"]: row for row in load_seed("vehicles.json")}
    fleet: list[dict[str, Any]] = []

    for index, route in enumerate(routes):
        vehicle = route.vehicle
        if vehicle is None:
            continue
        code = vehicle.code
        seed = seed_vehicles.get(code, {})
        waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
        progress = route_progress_percent(waypoints)
        next_wp = next((wp for wp in waypoints if wp.status == "pending"), None)
        next_point = "—"
        lng, lat = -62.715, 8.295
        if next_wp and next_wp.collection_point:
            cp = next_wp.collection_point
            next_point = cp.sector.name if cp.sector else cp.code
            lng = float(cp.longitude)
            lat = float(cp.latitude)
        elif waypoints and waypoints[-1].collection_point:
            cp = waypoints[-1].collection_point
            lng = float(cp.longitude)
            lat = float(cp.latitude)

        fleet.append(
            {
                "id": code,
                "status": STATUS_TO_UI.get(vehicle.status, vehicle.status),
                "driver": seed.get("driverName")
                or (f"{route.driver.first_name} {route.driver.last_name}" if route.driver else "—"),
                "route": f"Ruta optimizada {code}",
                "progress": progress,
                "speedKmh": 32 if progress < 100 else 0,
                "nextPoint": next_point,
                "color": ["#34D634", "#1143F3", "#7c3aed", "#f59e0b"][index % 4],
                "image": VEHICLE_IMAGES[index % len(VEHICLE_IMAGES)],
                "lng": lng,
                "lat": lat,
                "routeId": route.id,
            }
        )

    maintenance = db.scalars(select(Vehicle).where(Vehicle.status == "maintenance")).all()
    for index, vehicle in enumerate(maintenance):
        seed = seed_vehicles.get(vehicle.code, {})
        fleet.append(
            {
                "id": vehicle.code,
                "status": "mantenimiento",
                "driver": seed.get("driverName") or "—",
                "route": "—",
                "progress": 0,
                "speedKmh": None,
                "nextPoint": "Taller Central",
                "color": "#f59e0b",
                "image": VEHICLE_IMAGES[(index + 1) % len(VEHICLE_IMAGES)],
                "lng": -62.728,
                "lat": 8.29,
                "routeId": None,
            }
        )
    return fleet


def alerts_from_db(db: Session) -> list[dict[str, Any]]:
    points = db.scalars(
        select(CollectionPoint).options(joinedload(CollectionPoint.sector)).order_by(CollectionPoint.code)
    ).all()
    alerts: list[dict[str, Any]] = []
    now_label = datetime.now(timezone.utc).strftime("%d/%m/%Y %I:%M %p")

    for point in points:
        pct = fill_level_pct(point)
        if pct < 80:
            continue
        alerts.append(
            {
                "id": f"al-cp-{point.code}",
                "priority": "critica" if pct >= 90 else "advertencia",
                "title": "Contenedor crítico de llenado",
                "detail": f"Nivel {pct}%",
                "source": f"Contenedor {point.code}",
                "location": point.sector.name if point.sector else point.code,
                "datetime": now_label,
                "status": "nueva",
                "category": "contenedores",
                "lng": float(point.longitude),
                "lat": float(point.latitude),
            }
        )

    vehicles = db.scalars(select(Vehicle).where(Vehicle.status == "maintenance")).all()
    for vehicle in vehicles:
        alerts.append(
            {
                "id": f"al-vh-{vehicle.code}",
                "priority": "informativa",
                "title": "Vehículo en mantenimiento",
                "detail": "Unidad fuera de operación",
                "source": f"Vehículo {vehicle.code}",
                "location": "Taller Central",
                "datetime": now_label,
                "status": "en-progreso",
                "category": "mantenimiento",
                "lng": -62.728,
                "lat": 8.29,
            }
        )

    incidents = db.scalars(
        select(VehicleIncident)
        .options(joinedload(VehicleIncident.vehicle))
        .where(VehicleIncident.resolved_at.is_(None))
        .order_by(VehicleIncident.reported_at.desc())
        .limit(5)
    ).all()
    for incident in incidents:
        vehicle = incident.vehicle
        if vehicle is None:
            continue
        alerts.insert(
            0,
            {
                "id": f"al-inc-{incident.id}",
                "priority": "critica" if incident.incident_type == "breakdown" else "advertencia",
                "title": "Avería en ruta" if incident.incident_type == "breakdown" else "Incidencia operativa",
                "detail": incident.description or "Requiere atención",
                "source": f"Vehículo {vehicle.code}",
                "location": "En campo",
                "datetime": now_label,
                "status": "nueva",
                "category": "vehiculos",
                "lng": -62.72,
                "lat": 8.295,
            },
        )

    return alerts
