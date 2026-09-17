"""Payload de solo lectura para reproducción animada de rutas planificadas."""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import DailyPlan, OptimizedRoute, RouteWaypoint, Simulation
from app.domain.contingency_simulation import AlternativeRoutePayload
from app.domain.crew_service_time import (
    resolve_effective_assigned,
    service_time_seconds_per_stop,
)
from app.domain.landfill_service_time import DEFAULT_LANDFILL_LAT, DEFAULT_LANDFILL_LON
from app.domain.operational_clock import operational_departure_at
from app.services.operational_facilities_service import resolve_operational_facilities
from app.services.route_geometry_service import build_route_linestring_cached

PLAYBACK_ROUTE_STATUSES = ("pending", "in_progress", "completed")
MAX_PLAYBACK_ROUTES = 6
PLAYBACK_ROUTE_COLORS = ("#34D634", "#1143F3", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4")
#: Código canónico de la parada en vertedero (Fase 9).
PLAYBACK_LANDFILL_CODE = "VERTEDERO"


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


def _build_stop(
    waypoint: RouteWaypoint,
    *,
    service_minutes: int,
    landfill_service_minutes: int = 15,
    landfill_lon: float = DEFAULT_LANDFILL_LON,
    landfill_lat: float = DEFAULT_LANDFILL_LAT,
) -> dict[str, Any] | None:
    waypoint_type = getattr(waypoint, "waypoint_type", None) or "collection"
    if waypoint_type == "landfill":
        return {
            "sequence": int(waypoint.sequence_order),
            "lng": landfill_lon,
            "lat": landfill_lat,
            "code": PLAYBACK_LANDFILL_CODE,
            "serviceMinutes": landfill_service_minutes,
            "stopType": "landfill",
        }
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
        "stopType": "collection",
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
    # Reloj operativo (Fase 13.5): inicio de jornada en la zona configurada, no UTC.
    return operational_departure_at(plan.operation_date)


def _serialize_route(
    route: OptimizedRoute,
    *,
    color: str,
    service_minutes: int,
    plan: DailyPlan,
    landfill_service_minutes: int = 15,
    landfill_lon: float = DEFAULT_LANDFILL_LON,
    landfill_lat: float = DEFAULT_LANDFILL_LAT,
) -> dict[str, Any] | None:
    waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
    line_coordinates = build_route_linestring_cached(route, waypoints, include_depot=True)
    if len(line_coordinates) < 2:
        return None

    stops = [
        stop
        for wp in waypoints
        if (
            stop := _build_stop(
                wp,
                service_minutes=service_minutes,
                landfill_service_minutes=landfill_service_minutes,
                landfill_lon=landfill_lon,
                landfill_lat=landfill_lat,
            )
        )
        is not None
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
        "distanceKm": round(float(getattr(route, "total_distance_meters", None) or 0) / 1000, 1),
        "startTime": _resolve_start_time(plan, waypoints),
    }


def _normalize_feature_stop(
    raw: dict[str, Any],
    *,
    service_minutes: int,
) -> dict[str, Any] | None:
    """Parada de una feature per-vehículo → parada de playback.

    El motor no emite ``serviceMinutes`` (solo el recálculo real lo resuelve por
    tripulación); en la simulación se rellena con un valor mínimo para que el
    contrato de playback sea válido.
    """
    try:
        lng = float(raw["lng"])
        lat = float(raw["lat"])
        code = str(raw["code"])
        sequence = int(raw["sequence"])
    except (KeyError, TypeError, ValueError):
        return None
    if not code:
        return None

    raw_service = raw.get("serviceMinutes")
    if isinstance(raw_service, (int, float)) and raw_service > 0:
        service = int(raw_service)
    else:
        service = max(1, int(service_minutes))

    stop_type = raw.get("stopType")
    if stop_type not in ("collection", "landfill"):
        stop_type = "landfill" if code.upper() == PLAYBACK_LANDFILL_CODE else "collection"
    return {
        "sequence": sequence,
        "lng": lng,
        "lat": lat,
        "code": code,
        "serviceMinutes": service,
        "stopType": stop_type,
    }


def _synthetic_route_id(feature_id: Any) -> int:
    """Id numérico estable derivado del id textual de la feature (solo dry-run)."""
    if isinstance(feature_id, str):
        for token in reversed(feature_id.split("-")):
            digits = token.removeprefix("v")
            if digits.isdigit():
                return int(digits)
    return 1


def route_feature_to_playback_model(
    feature: dict[str, Any],
    color: str,
    *,
    route_id: int | None = None,
    service_minutes: int = 1,
) -> AlternativeRoutePayload | None:
    """Convierte una feature GeoJSON por vehículo en un modelo de playback.

    Espejo backend de ``mapContextFeatureToPlaybackModel``. La geometría y las
    paradas provienen del motor (dry-run), por lo que ``routeId``/``vehicleId``
    son sintéticos: una simulación no persiste rutas.
    """
    properties = feature.get("properties") or {}
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    if geometry.get("type") != "LineString" or len(coordinates) < 2:
        return None

    stops = [
        stop
        for raw in (properties.get("stops") or [])
        if (stop := _normalize_feature_stop(raw, service_minutes=service_minutes)) is not None
    ]
    if not stops:
        return None

    try:
        line_coordinates = [[float(pair[0]), float(pair[1])] for pair in coordinates]
    except (IndexError, TypeError, ValueError):
        return None

    resolved_id = route_id if route_id is not None else _synthetic_route_id(properties.get("id"))
    duration_raw = properties.get("durationMin")
    if isinstance(duration_raw, (int, float)) and duration_raw > 0:
        total_duration = int(round(duration_raw))
    else:
        total_duration = max(1, len(stops) * max(1, int(service_minutes)))
    distance_raw = properties.get("distanceKm")
    distance_km = round(float(distance_raw), 1) if isinstance(distance_raw, (int, float)) else 0.0

    return {
        "routeId": resolved_id,
        "vehicleId": resolved_id,
        "vehicleLabel": str(
            properties.get("vehicleCode") or properties.get("label") or f"Ruta {resolved_id}"
        ),
        "color": color,
        "lineCoordinates": line_coordinates,
        "stops": stops,
        "totalDurationMinutes": total_duration,
        "distanceKm": distance_km,
        "startTime": None,
    }


def route_features_to_playback_models(
    features: list[dict[str, Any]],
    *,
    service_minutes: int = 1,
) -> list[AlternativeRoutePayload]:
    """Serializa todas las features por vehículo de un recálculo a playback."""
    models: list[AlternativeRoutePayload] = []
    for index, feature in enumerate(features):
        model = route_feature_to_playback_model(
            feature,
            PLAYBACK_ROUTE_COLORS[index % len(PLAYBACK_ROUTE_COLORS)],
            route_id=index + 1,
            service_minutes=service_minutes,
        )
        if model is not None:
            models.append(model)
    return models


def build_daily_route_playback(db: Session, daily_plan_id: int) -> dict[str, Any]:
    """Arma el contrato de playback para un plan diario (solo lectura)."""
    return _build_route_playback_payload(
        db,
        daily_plan_id=daily_plan_id,
        simulation_id=None,
    )


def build_simulation_route_playback(db: Session, simulation_id: int) -> dict[str, Any]:
    """Arma el contrato de playback para rutas de una simulación (solo lectura)."""
    return _build_route_playback_payload(
        db,
        daily_plan_id=None,
        simulation_id=simulation_id,
    )


def _build_route_playback_payload(
    db: Session,
    *,
    daily_plan_id: int | None,
    simulation_id: int | None,
) -> dict[str, Any]:
    if daily_plan_id is not None:
        plan = db.get(DailyPlan, daily_plan_id)
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")
        simulation = db.get(Simulation, plan.simulation_id) if plan.simulation_id else None
        operation_date = plan.operation_date.isoformat()
        preview_mode = plan.status in {"draft", "open", "optimized"}
        # Preferir la simulación vigente del plan para no mezclar corridas anteriores.
        if plan.simulation_id is not None:
            route_filter = (
                OptimizedRoute.daily_plan_id == daily_plan_id,
                OptimizedRoute.simulation_id == plan.simulation_id,
            )
        else:
            route_filter = (OptimizedRoute.daily_plan_id == daily_plan_id,)
        response_id: dict[str, Any] = {"dailyPlanId": daily_plan_id}
    elif simulation_id is not None:
        simulation = db.get(Simulation, simulation_id)
        if simulation is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulación no encontrada")
        plan = None
        operation_date = (
            simulation.executed_at.date().isoformat()
            if simulation.executed_at is not None
            else date.today().isoformat()
        )
        preview_mode = True
        route_filter = (OptimizedRoute.simulation_id == simulation_id,)
        response_id = {"simulationId": simulation_id}
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Se requiere plan o simulación")

    operators_shortage = _operators_shortage_from_simulation(simulation)
    service_minutes = _service_minutes_per_stop(operators_shortage=operators_shortage)
    facilities = resolve_operational_facilities(db)
    landfill_lon, landfill_lat = facilities.landfill
    landfill_service_minutes = facilities.landfill_unload_minutes

    routes = db.scalars(
        select(OptimizedRoute)
        .where(
            *route_filter,
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
            plan=plan or DailyPlan(operation_date=date.fromisoformat(operation_date)),
            landfill_service_minutes=landfill_service_minutes,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
        )
        if item is not None:
            serialized.append(item)

    return {
        **response_id,
        "operationDate": operation_date,
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
    landfill_service_minutes: int = 15,
    landfill_lon: float = DEFAULT_LANDFILL_LON,
    landfill_lat: float = DEFAULT_LANDFILL_LAT,
) -> list[dict[str, Any]]:
    """Paradas serializadas para enriquecer propiedades GeoJSON en map/context."""
    waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
    return [
        stop
        for wp in waypoints
        if (
            stop := _build_stop(
                wp,
                service_minutes=service_minutes,
                landfill_service_minutes=landfill_service_minutes,
                landfill_lon=landfill_lon,
                landfill_lat=landfill_lat,
            )
        )
        is not None
    ]
