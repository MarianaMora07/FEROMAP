from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Sector, Vehicle
from app.services.route_geometry_service import (
    build_route_linestring_cached,
    snap_lonlat_sequence,
)
from app.services.seed_loader import load_seed
from app.services.simulation_routes import latest_computed_routes


def fill_level_pct(point: CollectionPoint) -> int:
    if point.max_capacity_kg <= 0:
        return 0
    pct = (point.current_fill_level_kg / point.max_capacity_kg) * Decimal("100")
    return int(round(float(pct)))


def priority_from_fill(pct: int) -> str:
    if pct >= 80:
        return "critica"
    if pct >= 60:
        return "alta"
    if pct >= 40:
        return "media"
    return "baja"


def seed_meta_by_code() -> dict[str, dict[str, Any]]:
    rows = load_seed("collection_points.json")
    return {row["code"]: row for row in rows}


def sector_geo_by_name() -> dict[str, dict[str, Any]]:
    rows = load_seed("sectors.json")
    return {row["name"]: row for row in rows}


def route_geo_by_kind(kind: str) -> dict[str, Any] | None:
    for row in load_seed("routes.json"):
        if row.get("kind") == kind:
            return row
    return None


def sectors_geojson(db: Session) -> dict[str, Any]:
    sectors = db.scalars(select(Sector).order_by(Sector.name)).all()
    geo_by_name = sector_geo_by_name()
    features = []
    for sector in sectors:
        meta = geo_by_name.get(sector.name, {})
        geometry = meta.get("geometry")
        if not geometry:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": sector.name,
                    "population": meta.get("population", 0),
                    "avgWasteKg": meta.get("avgWasteKg", 0),
                },
                "geometry": geometry,
            }
        )
    return {"type": "FeatureCollection", "features": features}


def collection_points_geojson(
    db: Session,
    *,
    sector: str | None = None,
    min_fill: int | None = None,
    sector_id: int | None = None,
) -> dict[str, Any]:
    stmt = (
        select(CollectionPoint)
        .options(joinedload(CollectionPoint.sector))
        .order_by(CollectionPoint.code)
    )
    points = db.scalars(stmt).all()
    meta_by_code = seed_meta_by_code()
    features = []
    for point in points:
        sector_name = point.sector.name if point.sector else ""
        if sector_id is not None and point.sector_id != sector_id:
            continue
        if sector and sector_name != sector:
            continue
        pct = fill_level_pct(point)
        if min_fill is not None and pct < min_fill:
            continue
        meta = meta_by_code.get(point.code, {})
        last_collection = meta.get("lastCollection")
        if last_collection is None and point.last_emptied_at:
            last_collection = point.last_emptied_at.isoformat().replace("+00:00", "Z")
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": point.code,
                    "sector": sector_name,
                    "fillLevel": pct,
                    "priority": meta.get("priority") or priority_from_fill(pct),
                    "lastCollection": last_collection,
                    "capacityKg": float(point.max_capacity_kg),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(point.longitude), float(point.latitude)],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def route_geojson(db: Session, kind: str) -> dict[str, Any]:
    computed = latest_computed_routes(db)
    if computed and kind in computed and computed[kind].get("features"):
        return computed[kind]

    route_row = route_geo_by_kind(kind)
    if route_row:
        coordinates = snap_lonlat_sequence(route_row["coordinates"], include_depot=False)
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "id": route_row["id"],
                        "type": kind,
                        "label": route_row["label"],
                        "distanceKm": route_row["distanceKm"],
                        "durationMin": route_row["durationMin"],
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": coordinates,
                    },
                }
            ],
        }

    db_route = db.scalar(
        select(OptimizedRoute)
        .where(OptimizedRoute.route_kind == kind)
        .order_by(OptimizedRoute.calculated_at.desc())
        .limit(1)
    )
    if db_route is None:
        return {"type": "FeatureCollection", "features": []}

    waypoints = db.scalars(
        select(RouteWaypoint)
        .where(RouteWaypoint.route_id == db_route.id)
        .options(joinedload(RouteWaypoint.collection_point))
        .order_by(RouteWaypoint.sequence_order)
    ).all()
    coordinates = build_route_linestring_cached(db_route, waypoints, include_depot=True)
    distance_km = float(db_route.total_distance_meters or 0) / 1000
    duration_min = int((db_route.estimated_duration_seconds or 0) / 60)
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": f"route-{kind}",
                    "type": kind,
                    "label": "Ruta optimizada (IA)" if kind == "optimized" else "Ruta actual (estática)",
                    "distanceKm": round(distance_km, 1),
                    "durationMin": duration_min,
                },
                "geometry": {"type": "LineString", "coordinates": coordinates},
            }
        ],
    }


def fleet_summary(db: Session) -> dict[str, int]:
    vehicles = db.scalars(select(Vehicle)).all()
    active = sum(1 for v in vehicles if v.status in {"in_route", "available"})
    in_route = sum(1 for v in vehicles if v.status == "in_route")
    return {
        "activeVehicles": in_route or active,
        "totalVehicles": len(vehicles),
        "driversOnShift": in_route or min(active, len(vehicles)),
    }
