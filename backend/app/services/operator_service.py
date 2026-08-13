"""Snapshot de ruta del conductor — paradas ordenadas y progreso."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, DailyPlan, OptimizedRoute, RouteWaypoint, User, UserRole
from app.services.collection_point_service import seed_meta_by_code
from app.services.geo_service import fill_level_pct
from app.services.operations_service import route_progress_percent


def _empty_snapshot(operation_date: date | None = None) -> dict[str, Any]:
    today = operation_date or date.today()
    return {
        "operationDate": today.isoformat(),
        "dailyPlanId": None,
        "dailyPlanStatus": None,
        "dailyPlanClosedAt": None,
        "routeId": None,
        "vehicleId": None,
        "routeLabel": None,
        "progress": 0,
        "stopsDone": 0,
        "stopsTotal": 0,
        "totalDistanceKm": None,
        "traveledDistanceKm": None,
        "remainingDistanceKm": None,
        "nextStop": None,
        "stops": [],
    }


def _driver_filter_for_user(user: User) -> int | None:
    if user.role == UserRole.conductor:
        if user.driver_profile is None:
            return -1
        return user.driver_profile.id
    return None


def _serialize_stop(waypoint: RouteWaypoint) -> dict[str, Any]:
    point = waypoint.collection_point
    meta = seed_meta_by_code().get(point.code, {}) if point else {}
    sector_name = point.sector.name if point and point.sector else meta.get("sectorName")
    fill_level = fill_level_pct(point) if point else None
    notes_parts: list[str] = []
    if meta.get("frequency"):
        notes_parts.append(f"Frecuencia: {meta['frequency']}")
    if fill_level is not None:
        notes_parts.append(f"Llenado {fill_level}%")
    if meta.get("priority"):
        notes_parts.append(f"Prioridad {meta['priority']}")

    status_ui = waypoint.status
    if status_ui == "completed":
        status_ui = "visited"
    elif status_ui == "skipped":
        status_ui = "omitted"

    return {
        "waypointId": waypoint.id,
        "sequenceOrder": waypoint.sequence_order,
        "status": status_ui,
        "collectionPointId": point.id if point else None,
        "code": point.code if point else "—",
        "sectorName": sector_name,
        "address": meta.get("address") or sector_name or "—",
        "notes": ". ".join(notes_parts) if notes_parts else None,
        "fillLevelPct": fill_level,
        "lng": float(point.longitude) if point else None,
        "lat": float(point.latitude) if point else None,
        "estimatedArrivalAt": waypoint.estimated_arrival_at.isoformat()
        if waypoint.estimated_arrival_at
        else None,
        "actualArrivalAt": waypoint.actual_arrival_at.isoformat() if waypoint.actual_arrival_at else None,
    }


def _remaining_distance_km(route: OptimizedRoute, progress: int) -> float | None:
    if route.total_distance_meters is None:
        return None
    total_km = float(route.total_distance_meters) / 1000
    if progress >= 100:
        return 0.0
    return round(total_km * (1 - progress / 100), 1)


def _total_distance_km(route: OptimizedRoute) -> float | None:
    if route.total_distance_meters is None:
        return None
    return round(float(route.total_distance_meters) / 1000, 1)


def _traveled_distance_km(route: OptimizedRoute, progress: int) -> float | None:
    total = _total_distance_km(route)
    if total is None:
        return None
    return round(total * progress / 100, 1)


def _route_query(*, driver_id: int | None, statuses: tuple[str, ...]):
    stmt = (
        select(OptimizedRoute)
        .where(OptimizedRoute.status.in_(statuses))
        .options(
            joinedload(OptimizedRoute.vehicle),
            joinedload(OptimizedRoute.driver),
            joinedload(OptimizedRoute.daily_plan),
            joinedload(OptimizedRoute.waypoints)
            .joinedload(RouteWaypoint.collection_point)
            .joinedload(CollectionPoint.sector),
        )
        .order_by(OptimizedRoute.id.desc())
    )
    if driver_id is not None:
        stmt = stmt.where(OptimizedRoute.driver_id == driver_id)
    return stmt


def _serialize_route_snapshot(route: OptimizedRoute, operation_date: date | None = None) -> dict[str, Any]:
    waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
    stops = [_serialize_stop(wp) for wp in waypoints]
    progress = route_progress_percent(waypoints)
    completed = sum(1 for wp in waypoints if wp.status == "completed")
    next_stop = next((stop for stop in stops if stop["status"] == "pending"), None)

    daily_plan = route.daily_plan
    vehicle = route.vehicle
    operation = daily_plan.operation_date if daily_plan else (operation_date or date.today())

    return {
        "operationDate": operation.isoformat(),
        "dailyPlanId": daily_plan.id if daily_plan else route.daily_plan_id,
        "dailyPlanStatus": daily_plan.status if daily_plan else None,
        "dailyPlanClosedAt": daily_plan.closed_at.isoformat()
        if daily_plan and daily_plan.closed_at
        else None,
        "routeId": route.id,
        "vehicleId": vehicle.code if vehicle else None,
        "routeLabel": f"Ruta {vehicle.code}" if vehicle else f"Ruta {route.id}",
        "progress": progress,
        "stopsDone": completed,
        "stopsTotal": len(waypoints),
        "totalDistanceKm": _total_distance_km(route),
        "traveledDistanceKm": _traveled_distance_km(route, progress),
        "remainingDistanceKm": _remaining_distance_km(route, progress),
        "nextStop": next_stop,
        "stops": stops,
    }


def operator_route_snapshot(
    db: Session,
    user: User,
    *,
    operation_date: date | None = None,
) -> dict[str, Any]:
    driver_id = _driver_filter_for_user(user)
    if driver_id == -1:
        return _empty_snapshot(operation_date)

    today = operation_date or date.today()
    daily_plan = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == today))

    route = db.scalars(_route_query(driver_id=driver_id, statuses=("in_progress",))).unique().first()
    if route is None and daily_plan is not None:
        stmt = _route_query(driver_id=driver_id, statuses=("completed",)).where(
            OptimizedRoute.daily_plan_id == daily_plan.id,
        )
        route = db.scalars(stmt).unique().first()

    if route is not None:
        return _serialize_route_snapshot(route, operation_date)

    if daily_plan is None:
        return _empty_snapshot(today)
    return {
        **_empty_snapshot(today),
        "dailyPlanId": daily_plan.id,
        "dailyPlanStatus": daily_plan.status,
        "dailyPlanClosedAt": daily_plan.closed_at.isoformat() if daily_plan.closed_at else None,
    }


def operator_route_snapshot_or_403(db: Session, user: User, *, operation_date: date | None = None) -> dict[str, Any]:
    if user.role not in {UserRole.conductor, UserRole.administrador, UserRole.planificador}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver la ruta del operador",
        )
    return operator_route_snapshot(db, user, operation_date=operation_date)
