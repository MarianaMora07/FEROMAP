"""Proximidad del camión de recolección respecto al sector del residente."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, User, UserRole
from app.services.operations_service import live_fleet_view
from app.services.resident_schedule_service import build_resident_schedule

ResidentProximityStatus = Literal[
    "approaching",
    "in_sector",
    "completed",
    "not_scheduled",
    "no_active_route",
]

AVG_MINUTES_PER_STOP = 5
AVERAGE_SPEED_KMH = 25.0
EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _minutes_from_distance_km(distance_km: float) -> int:
    if distance_km <= 0:
        return AVG_MINUTES_PER_STOP
    hours = distance_km / AVERAGE_SPEED_KMH
    return max(AVG_MINUTES_PER_STOP, int(math.ceil(hours * 60)))


def _load_routes_for_sector(db: Session, sector_id: int) -> list[OptimizedRoute]:
    routes = db.scalars(
        select(OptimizedRoute)
        .where(OptimizedRoute.status.in_(["in_progress", "pending"]))
        .options(
            joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
            joinedload(OptimizedRoute.vehicle),
        )
    ).unique().all()
    serving: list[OptimizedRoute] = []
    for route in routes:
        sector_waypoints = [
            wp
            for wp in route.waypoints
            if wp.collection_point and wp.collection_point.sector_id == sector_id
        ]
        if sector_waypoints:
            serving.append(route)
    return serving


def _sector_waypoints(route: OptimizedRoute, sector_id: int) -> list[RouteWaypoint]:
    return sorted(
        [
            wp
            for wp in route.waypoints
            if wp.collection_point and wp.collection_point.sector_id == sector_id
        ],
        key=lambda wp: wp.sequence_order,
    )


def _stops_before_sector(route: OptimizedRoute, sector_id: int) -> int:
    ordered = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
    first_sector_pending: int | None = None
    for index, waypoint in enumerate(ordered):
        point = waypoint.collection_point
        if (
            point
            and point.sector_id == sector_id
            and waypoint.status == "pending"
        ):
            first_sector_pending = index
            break
    if first_sector_pending is None:
        return 0
    return sum(
        1
        for waypoint in ordered[:first_sector_pending]
        if waypoint.status == "pending"
    )


def _resolve_proximity_status(
    *,
    route: OptimizedRoute | None,
    sector_id: int,
    is_collection_day: bool,
) -> ResidentProximityStatus:
    if route is None:
        return "not_scheduled" if not is_collection_day else "no_active_route"

    sector_wps = _sector_waypoints(route, sector_id)
    pending_in_sector = [wp for wp in sector_wps if wp.status == "pending"]
    completed_in_sector = len(sector_wps) - len(pending_in_sector)

    if sector_wps and not pending_in_sector:
        return "completed"
    if route.status == "in_progress" and completed_in_sector > 0 and pending_in_sector:
        return "in_sector"
    if pending_in_sector:
        return "approaching"
    return "no_active_route"


def _estimate_minutes(
    *,
    route: OptimizedRoute,
    sector_id: int,
    stops_before_sector: int,
    fleet_entry: dict[str, Any] | None,
    next_stop_in_sector: str | None,
    db: Session,
) -> int:
    stop_based = max(
        AVG_MINUTES_PER_STOP,
        stops_before_sector * AVG_MINUTES_PER_STOP + AVG_MINUTES_PER_STOP,
    )
    if fleet_entry is None or not next_stop_in_sector:
        return stop_based

    target = db.scalar(
        select(CollectionPoint).where(
            CollectionPoint.code == next_stop_in_sector,
            CollectionPoint.sector_id == sector_id,
        )
    )
    if target is None:
        return stop_based

    vehicle_lat = fleet_entry.get("lat")
    vehicle_lng = fleet_entry.get("lng")
    if vehicle_lat is None or vehicle_lng is None:
        return stop_based

    distance_km = _haversine_km(
        float(vehicle_lat),
        float(vehicle_lng),
        float(target.latitude),
        float(target.longitude),
    )
    distance_based = _minutes_from_distance_km(distance_km)
    return max(stop_based, min(distance_based, stop_based + 30))


def _primary_route(routes: list[OptimizedRoute]) -> OptimizedRoute | None:
    return (
        next((route for route in routes if route.status == "in_progress"), None)
        or next((route for route in routes if route.status == "pending"), None)
        or (routes[0] if routes else None)
    )


def build_resident_proximity(db: Session, user: User) -> dict[str, Any]:
    if user.role != UserRole.residente:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Solo disponible para residentes",
        )
    if user.sector_id is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="El usuario no tiene sector asignado",
        )

    now = datetime.now(timezone.utc)
    schedule = build_resident_schedule(db, sector_id=user.sector_id, reference=now)
    is_collection_day = bool(schedule.get("isCollectionDay"))
    routes = _load_routes_for_sector(db, user.sector_id)
    route = _primary_route(routes)
    proximity_status = _resolve_proximity_status(
        route=route,
        sector_id=user.sector_id,
        is_collection_day=is_collection_day,
    )

    if route is None:
        return {
            "status": proximity_status,
            "vehicleCode": None,
            "routeId": None,
            "estimatedMinutes": None,
            "stopsBeforeSector": 0,
            "nextStopInSector": None,
            "completedStopsInSector": 0,
            "totalStopsInSector": 0,
            "lastUpdatedAt": now.isoformat(),
        }

    sector_wps = _sector_waypoints(route, user.sector_id)
    pending_in_sector = [wp for wp in sector_wps if wp.status == "pending"]
    vehicle_code = route.vehicle.code if route.vehicle else f"R-{route.id}"
    fleet = live_fleet_view(db)
    fleet_entry = next(
        (item for item in fleet if item.get("routeId") == route.id or item.get("id") == vehicle_code),
        None,
    )
    stops_before = _stops_before_sector(route, user.sector_id)
    next_stop = pending_in_sector[0].collection_point.code if pending_in_sector else None
    estimated = None
    if proximity_status in {"approaching", "in_sector"}:
        estimated = _estimate_minutes(
            route=route,
            sector_id=user.sector_id,
            stops_before_sector=stops_before,
            fleet_entry=fleet_entry,
            next_stop_in_sector=next_stop,
            db=db,
        )

    return {
        "status": proximity_status,
        "vehicleCode": vehicle_code,
        "routeId": route.id,
        "estimatedMinutes": estimated,
        "stopsBeforeSector": stops_before,
        "nextStopInSector": next_stop,
        "completedStopsInSector": len(sector_wps) - len(pending_in_sector),
        "totalStopsInSector": len(sector_wps),
        "lastUpdatedAt": now.isoformat(),
    }
