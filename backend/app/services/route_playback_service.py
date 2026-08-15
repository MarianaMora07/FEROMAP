"""Payload de solo lectura para reproducción animada de rutas planificadas."""

from __future__ import annotations

import json
from datetime import datetime, time, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import DailyPlan, OptimizedRoute, RouteWaypoint, Simulation
from app.domain.crew_service_time import (
    resolve_effective_assigned,
    service_time_seconds_per_stop,
)
from app.services.route_geometry_service import build_route_linestring_cached

PLAYBACK_ROUTE_STATUSES = ("pending", "in_progress", "completed")
MAX_PLAYBACK_ROUTES = 6
PLAYBACK_ROUTE_COLORS = ("#34D634", "#1143F3", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4")


def _operators_shortage_from_simulation(simulation: Simulation | None) -> int | None:
    if simulation is None or not simulation.parameters_json:
        return None
    try:
        params = json.loads(simulation.parameters_json)
    except (json.JSONDecodeError, TypeError):
        return None
    shortage = params.get("operatorsShortage")
    if shortage is None:
        shortage = params.get("operators_shortage")
    if shortage is None:
        return None
    try:
        return int(shortage)
    except (TypeError, ValueError):
        return None


def _service_minutes_per_stop(*, operators_shortage: int | None) -> int:
    assigned = resolve_effective_assigned(6, operators_shortage=operators_shortage)
    seconds = service_time_seconds_per_stop(assigned)
    return max(1, int(round(seconds / 60)))


def _build_stop(waypoint: RouteWaypoint, *, service_minutes: int) -> dict[str, Any] | None:
    point = waypoint.collection_point
    if point is None:
        return None
    try:
        lng = float(point.longitude)
        lat = float(point.latitude)
    except (AttributeError, TypeError, ValueError):
        return None
    return {
        "sequence": int(waypoint.sequence_order),
        "lng": lng,
        "lat": lat,
        "code": str(point.code),
        "serviceMinutes": service_minutes,
    }


def _resolve_start_time(
    plan: DailyPlan,
    waypoints: list[RouteWaypoint],
) -> datetime | None:
    for waypoint in waypoints:
        estimated = getattr(waypoint, "estimated_arrival_at", None)
        if estimated is not None:
            return estimated
    if plan.operation_date is None:
        return None
    return datetime.combine(plan.operation_date, time(6, 0), tzinfo=timezone.utc)


def _serialize_route(
    route: OptimizedRoute,
    *,
    color: str,
    service_minutes: int,
    plan: DailyPlan,
) -> dict[str, Any] | None:
    waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
    line_coordinates = build_route_linestring_cached(route, waypoints, include_depot=True)
    if len(line_coordinates) < 2:
        return None

    stops = [
        stop
        for wp in waypoints
        if (stop := _build_stop(wp, service_minutes=service_minutes)) is not None
    ]
    if not stops:
        return None

    vehicle = route.vehicle
    vehicle_label = vehicle.code if vehicle else f"R-{route.id}"
    total_seconds = int(route.estimated_duration_seconds or 0)
    if total_seconds <= 0 and stops:
        total_seconds = len(stops) * service_minutes * 60

    return {
        "routeId": route.id,
        "vehicleId": getattr(vehicle, "id", 0) if vehicle else 0,
        "vehicleLabel": vehicle_label,
        "color": color,
        "lineCoordinates": line_coordinates,
        "stops": stops,
        "totalDurationMinutes": max(1, int(round(total_seconds / 60))),
        "startTime": _resolve_start_time(plan, waypoints),
    }


def build_daily_route_playback(db: Session, daily_plan_id: int) -> dict[str, Any]:
    """Arma el contrato de playback para un plan diario (solo lectura)."""
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")

    simulation = db.get(Simulation, plan.simulation_id) if plan.simulation_id else None
    operators_shortage = _operators_shortage_from_simulation(simulation)
    service_minutes = _service_minutes_per_stop(operators_shortage=operators_shortage)

    routes = db.scalars(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status.in_(PLAYBACK_ROUTE_STATUSES),
        )
        .options(
            joinedload(OptimizedRoute.vehicle),
            joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
        )
        .order_by(OptimizedRoute.id)
        .limit(MAX_PLAYBACK_ROUTES)
    ).unique().all()

    serialized: list[dict[str, Any]] = []
    for index, route in enumerate(routes):
        item = _serialize_route(
            route,
            color=PLAYBACK_ROUTE_COLORS[index % len(PLAYBACK_ROUTE_COLORS)],
            service_minutes=service_minutes,
            plan=plan,
        )
        if item is not None:
            serialized.append(item)

    preview_mode = plan.status in {"draft", "open", "optimized"}

    return {
        "dailyPlanId": daily_plan_id,
        "operationDate": plan.operation_date.isoformat(),
        "previewMode": preview_mode,
        "routes": serialized,
    }


def operators_shortage_from_simulation(simulation: Simulation | None) -> int | None:
    return _operators_shortage_from_simulation(simulation)


def service_minutes_for_plan(db: Session, plan: DailyPlan) -> int:
    simulation = db.get(Simulation, plan.simulation_id) if plan.simulation_id else None
    return _service_minutes_per_stop(
        operators_shortage=operators_shortage_from_simulation(simulation),
    )


def route_start_time(plan: DailyPlan, waypoints: list[RouteWaypoint]) -> datetime | None:
    return _resolve_start_time(plan, waypoints)


def playback_stops_for_route_feature(
    route: OptimizedRoute,
    *,
    service_minutes: int,
) -> list[dict[str, Any]]:
    """Paradas serializadas para enriquecer propiedades GeoJSON en map/context."""
    waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
    return [
        stop
        for wp in waypoints
        if (stop := _build_stop(wp, service_minutes=service_minutes)) is not None
    ]
