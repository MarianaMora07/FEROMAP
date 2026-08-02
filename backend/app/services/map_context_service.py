"""Contexto geoespacial unificado para mapa GIS, monitoreo y dashboard."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Vehicle
from app.services.contingency_service import list_recent_incidents
from app.services.geo_service import collection_points_geojson, fill_level_pct
from app.services.operations_service import live_fleet_view

ROUTE_COLORS = ("#34D634", "#1143F3", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4")


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float] | None:
    if not bbox:
        return None
    parts = [part.strip() for part in bbox.split(",")]
    if len(parts) != 4:
        return None
    try:
        min_lng, min_lat, max_lng, max_lat = (float(value) for value in parts)
    except ValueError:
        return None
    return min_lng, min_lat, max_lng, max_lat


def _in_bbox(lng: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    min_lng, min_lat, max_lng, max_lat = bbox
    return min_lng <= lng <= max_lng and min_lat <= lat <= max_lat


def _container_bucket(fill_level: int) -> str:
    if fill_level >= 80:
        return "critical"
    if fill_level >= 60:
        return "full"
    if fill_level >= 40:
        return "normal"
    return "partial"


def active_routes_geojson(db: Session, *, driver_id: int | None = None) -> dict[str, Any]:
    stmt = (
        select(OptimizedRoute)
        .where(OptimizedRoute.status == "in_progress")
        .options(
            joinedload(OptimizedRoute.vehicle),
            joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
        )
        .order_by(OptimizedRoute.id)
    )
    if driver_id is not None:
        if driver_id < 0:
            return {"type": "FeatureCollection", "features": []}
        stmt = stmt.where(OptimizedRoute.driver_id == driver_id)

    routes = db.scalars(stmt).unique().all()
    features: list[dict[str, Any]] = []
    for index, route in enumerate(routes):
        waypoints = sorted(route.waypoints, key=lambda wp: wp.sequence_order)
        coordinates = [
            [float(wp.collection_point.longitude), float(wp.collection_point.latitude)]
            for wp in waypoints
            if wp.collection_point is not None
        ]
        if len(coordinates) < 2:
            continue
        vehicle = route.vehicle
        code = vehicle.code if vehicle else f"R-{route.id}"
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": f"route-{route.id}",
                    "routeId": route.id,
                    "label": f"Ruta {code}",
                    "color": ROUTE_COLORS[index % len(ROUTE_COLORS)],
                    "vehicleId": code,
                    "type": "active",
                },
                "geometry": {"type": "LineString", "coordinates": coordinates},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def _filter_geojson_points(
    geojson: dict[str, Any],
    *,
    bbox: tuple[float, float, float, float] | None,
) -> dict[str, Any]:
    if bbox is None:
        return geojson
    features = []
    for feature in geojson.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates")
        if not coords or len(coords) < 2:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        if _in_bbox(lng, lat, bbox):
            features.append(feature)
    return {"type": "FeatureCollection", "features": features}


def _filter_fleet(
    fleet: list[dict[str, Any]],
    *,
    bbox: tuple[float, float, float, float] | None,
) -> list[dict[str, Any]]:
    if bbox is None:
        return fleet
    return [
        vehicle
        for vehicle in fleet
        if _in_bbox(float(vehicle.get("lng", 0)), float(vehicle.get("lat", 0)), bbox)
    ]


def _build_map_metrics(db: Session, *, active_routes: int) -> list[dict[str, Any]]:
    vehicles = db.scalars(select(Vehicle)).all()
    points = db.scalars(select(CollectionPoint)).all()
    total_points = len(points)
    critical = 0
    full = 0
    for point in points:
        pct = fill_level_pct(point)
        if pct >= 90:
            critical += 1
        elif pct >= 70:
            full += 1
    in_route = sum(1 for vehicle in vehicles if vehicle.status == "in_route")

    return [
        {
            "id": "total",
            "label": "Contenedores totales",
            "value": total_points,
            "tone": "green",
            "icon": "trash",
        },
        {
            "id": "critical",
            "label": "Contenedores críticos",
            "value": critical,
            "tone": "red",
            "icon": "trash",
        },
        {
            "id": "full",
            "label": "Contenedores llenos",
            "value": full,
            "tone": "amber",
            "icon": "trash",
        },
        {
            "id": "vehicles",
            "label": "Vehículos activos",
            "value": in_route,
            "tone": "blue",
            "icon": "truck",
        },
        {
            "id": "routes",
            "label": "Rutas en ejecución",
            "value": active_routes,
            "tone": "green",
            "icon": "route",
        },
    ]


def _build_live_activities(
    db: Session,
    fleet: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    activities: list[dict[str, Any]] = []
    now_label = datetime.now(timezone.utc).strftime("%I:%M %p")

    for vehicle in fleet[:4]:
        status = vehicle.get("status")
        tone = "info"
        if status == "mantenimiento":
            tone = "warning"
        elif status == "detenido":
            tone = "danger"
        elif status == "en-ruta":
            tone = "success"
        text = (
            f"{vehicle['id']} — {vehicle.get('route', 'sin ruta')}"
            if status == "en-ruta"
            else f"{vehicle['id']} en {status.replace('-', ' ')}"
        )
        activities.append(
            {
                "id": f"fleet-{vehicle['id']}",
                "time": now_label,
                "text": text,
                "tone": tone,
            }
        )

    for incident in list_recent_incidents(db, limit=4):
        reported = incident.get("reportedAt")
        time_label = now_label
        if reported:
            try:
                time_label = datetime.fromisoformat(reported).strftime("%I:%M %p")
            except ValueError:
                time_label = now_label
        activities.append(
            {
                "id": f"incident-{incident['id']}",
                "time": time_label,
                "text": (
                    f"Avería {incident['vehicleId']}: "
                    f"{incident.get('description') or 'requiere atención'}"
                ),
                "tone": "warning" if incident.get("incidentType") != "breakdown" else "danger",
            }
        )

    return activities[:8]


def map_operational_context(
    db: Session,
    *,
    sector: str | None = None,
    bbox: str | None = None,
    driver_id: int | None = None,
) -> dict[str, Any]:
    bbox_tuple = _parse_bbox(bbox)
    fleet = _filter_fleet(live_fleet_view(db, driver_id=driver_id), bbox=bbox_tuple)
    routes = active_routes_geojson(db, driver_id=driver_id)

    if bbox_tuple is not None:
        filtered_route_features = []
        for feature in routes.get("features", []):
            coords = feature.get("geometry", {}).get("coordinates", [])
            if any(_in_bbox(float(lng), float(lat), bbox_tuple) for lng, lat in coords):
                filtered_route_features.append(feature)
        routes = {"type": "FeatureCollection", "features": filtered_route_features}

    containers = collection_points_geojson(db, sector=sector, min_fill=40)
    if not containers.get("features"):
        containers = collection_points_geojson(db, sector=sector)
    containers = _filter_geojson_points(containers, bbox=bbox_tuple)

    for feature in containers.get("features", []):
        fill_level = int(feature.get("properties", {}).get("fillLevel", 0))
        feature["properties"]["bucket"] = _container_bucket(fill_level)

    metrics = _build_map_metrics(db, active_routes=len(routes.get("features", [])))
    activities = _build_live_activities(db, fleet)

    return {
        "vehicles": fleet,
        "routes": routes,
        "containers": containers,
        "mapMetrics": metrics,
        "liveActivities": activities,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
