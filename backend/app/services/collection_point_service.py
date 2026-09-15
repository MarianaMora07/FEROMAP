"""Resumen agregado de puntos de recolección."""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import random
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Sector, User, UserRole, VisitSchedule
from app.domain.criticality import (
    fill_status_from_level,
    is_critical_now,
    is_overloaded,
    required_visits_per_week,
)
from app.domain.waste_generation import (
    CRITICAL_FILL_PCT,
    critical_day_offset,
    effective_fill_hours,
    effective_fill_rate_factor,
    estimated_fill_hours,
    fill_events_cycle_daily_values,
    generation_rate_kg_per_day,
    overflow_kg,
    overflow_ratio,
    projected_fill_level_kg,
)
from app.schemas.collection_point import CollectionPointCreate, CollectionPointUpdate
from app.services.geo_service import fill_level_pct, priority_from_fill, seed_meta_by_code
from app.services.graph_service import UNARE_BBOX, load_road_graph, nearest_node
from app.services.sector_service import (
    distribute_sector_generation_rate,
    effective_zone_rate_kg_per_day,
)

logger = logging.getLogger(__name__)

STATUS_LABELS: dict[str, str] = {
    "critico": "Crítico",
    "lleno": "Lleno",
    "normal": "Normal",
    "parcial": "Parcial",
    "fueraDeServicio": "Fuera de servicio",
}

DISTRIBUTION_ORDER = ("critico", "lleno", "normal", "parcial", "fueraDeServicio")

MONTHS_ES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def _empty_summary() -> dict[str, Any]:
    kpis = {key: 0 for key in ("total", *DISTRIBUTION_ORDER)}
    return {"kpis": kpis, "distribution": [], "sectors": []}


def build_summary_from_points(points: list[CollectionPoint]) -> dict[str, Any]:
    counts = {key: 0 for key in DISTRIBUTION_ORDER}
    sector_names: set[str] = set()

    for point in points:
        if point.deleted_at is not None:
            continue
        sector_name = point.sector.name if point.sector else ""
        if sector_name:
            sector_names.add(sector_name)

        level = fill_level_pct(point)
        bucket = fill_status_from_level(level, point_status=point.status)
        counts[bucket] += 1

    total = sum(counts.values())
    distribution = []
    for key in DISTRIBUTION_ORDER:
        count = counts[key]
        if count <= 0:
            continue
        distribution.append(
            {
                "status": key,
                "label": STATUS_LABELS[key],
                "count": count,
                "pct": int(round(count / total * 100)) if total else 0,
            }
        )

    return {
        "kpis": {"total": total, **counts},
        "distribution": distribution,
        "sectors": sorted(sector_names),
    }


def collection_points_summary(db: Session, user: User) -> dict[str, Any]:
    if user.role == UserRole.residente:
        if user.sector_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario no tiene sector asignado",
            )
        stmt = (
            select(CollectionPoint)
            .where(
                CollectionPoint.sector_id == user.sector_id,
                CollectionPoint.deleted_at.is_(None),
            )
            .options(joinedload(CollectionPoint.sector))
            .order_by(CollectionPoint.code)
        )
    else:
        stmt = (
            select(CollectionPoint)
            .where(CollectionPoint.deleted_at.is_(None))
            .options(joinedload(CollectionPoint.sector))
            .order_by(CollectionPoint.code)
        )

    points = db.scalars(stmt).all()
    if not points and user.role == UserRole.residente:
        return _empty_summary()

    return build_summary_from_points(list(points))


def _frontend_status(bucket: str) -> str:
    if bucket == "fueraDeServicio":
        return "fuera-de-servicio"
    return bucket


def _format_last_collection(
    seed_value: str | None,
    last_emptied: datetime | None,
) -> str:
    if seed_value:
        return seed_value
    if last_emptied is None:
        return "—"
    return last_emptied.astimezone(timezone.utc).strftime("%d/%m/%Y %I:%M %p")


def _day_label(day: date) -> str:
    month = MONTHS_ES[day.month - 1]
    return f"{day.day:02d} {month}"


def _resolve_collection_point(db: Session, code: str, user: User) -> CollectionPoint:
    point = db.scalar(
        select(CollectionPoint)
        .where(CollectionPoint.code == code, CollectionPoint.deleted_at.is_(None))
        .options(joinedload(CollectionPoint.sector))
    )
    if point is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Punto de recolección no encontrado: {code}",
        )

    if user.role == UserRole.residente:
        if user.sector_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario no tiene sector asignado",
            )
        if point.sector_id != user.sector_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes acceso a este punto de recolección",
            )

    return point


def serialize_collection_point_detail(point: CollectionPoint) -> dict[str, Any]:
    meta = seed_meta_by_code().get(point.code, {})
    fill_level = fill_level_pct(point)
    sector_name = point.sector.name if point.sector else ""
    status_bucket = fill_status_from_level(fill_level, point_status=point.status)
    last_emptied = point.last_emptied_at
    seed_last = meta.get("lastCollection")
    capacity_kg = float(point.max_capacity_kg)
    projected_kg = float(projected_fill_level_kg(point))

    return {
        "code": point.code,
        "id": point.code,
        "label": meta.get("label") or f"Punto {point.code}",
        "address": meta.get("address") or sector_name,
        "sector": sector_name,
        "sectorId": point.sector_id,
        "fillLevel": fill_level,
        "status": _frontend_status(status_bucket),
        "active": point.status == "active",
        "containerType": meta.get("containerType", "Estándar"),
        "capacityKg": capacity_kg,
        "capacityL": float(meta.get("capacityL", capacity_kg)),
        "currentFillLevelKg": projected_kg,
        "lastEmptiedAt": last_emptied.isoformat() if last_emptied else None,
        "lastCollection": _format_last_collection(seed_last, last_emptied),
        "frequency": meta.get("frequency", "Diaria"),
        "latitude": float(point.latitude),
        "longitude": float(point.longitude),
        "priority": meta.get("priority") or priority_from_fill(fill_level),
        "roadNodeId": point.road_node_id,
        "priorityBoost": bool(getattr(point, "priority_boost", False)),
        "fillRateFactorOverride": (
            float(point.fill_rate_factor_override)
            if getattr(point, "fill_rate_factor_override", None) is not None
            else None
        ),
        "fillRateFactor": effective_fill_rate_factor(point),
        "estimatedFillHours": estimated_fill_hours(point),
        "effectiveFillHours": effective_fill_hours(point),
        "generationRateKgPerDay": generation_rate_kg_per_day(point),
        "generationRateOverrideKgPerDay": (
            float(point.generation_rate_kg_per_day)
            if getattr(point, "generation_rate_kg_per_day", None) is not None
            else None
        ),
        "servedPopulation": (
            float(point.served_population)
            if getattr(point, "served_population", None) is not None
            else None
        ),
        "overflowKg": float(overflow_kg(point)),
        "overflowPct": int(round(overflow_ratio(point) * 100)),
        "lastCalibratedAt": (
            point.last_calibrated_at.isoformat()
            if getattr(point, "last_calibrated_at", None) is not None
            else None
        ),
        "calibrationSamples": (
            int(point.calibration_samples)
            if getattr(point, "calibration_samples", None) is not None
            else None
        ),
    }


def collection_point_detail(db: Session, code: str, user: User) -> dict[str, Any]:
    point = _resolve_collection_point(db, code, user)
    return serialize_collection_point_detail(point)


def _simulated_fill_history(point: CollectionPoint, days: int) -> dict[str, Any]:
    current = fill_level_pct(point)
    seed = int(hashlib.md5(point.code.encode(), usedforsecurity=False).hexdigest()[:8], 16)
    rng = random.Random(seed)

    today = datetime.now(timezone.utc).date()
    start = max(5, current - rng.randint(18, 42))
    values: list[int] = []

    for index in range(days):
        progress = index / max(days - 1, 1)
        noise = rng.randint(-4, 4)
        value = int(round(start + (current - start) * progress + noise))
        values.append(max(0, min(100, value)))

    if values:
        values[-1] = current

    labels = [_day_label(today - timedelta(days=days - 1 - index)) for index in range(days)]
    return {"labels": labels, "values": values}


def _history_from_waypoints(db: Session, point: CollectionPoint, days: int) -> dict[str, list] | None:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    waypoints = db.scalars(
        select(RouteWaypoint)
        .where(
            RouteWaypoint.collection_point_id == point.id,
            # El avance de ruta marca las paradas como "completed" (ver
            # operations_service.advance_route); se acepta también "collected"
            # por si existen registros legacy con ese estado.
            RouteWaypoint.status.in_(("collected", "completed")),
        )
        .order_by(RouteWaypoint.actual_arrival_at.asc(), RouteWaypoint.updated_at.asc())
    ).all()

    events: list[tuple[datetime, float]] = []
    for waypoint in waypoints:
        moment = waypoint.actual_arrival_at or waypoint.updated_at
        if moment is None or moment < since:
            continue
        if waypoint.collected_weight_kg is None:
            continue
        events.append((moment, float(waypoint.collected_weight_kg)))

    values = fill_events_cycle_daily_values(point, events, days=days)
    if not values:
        return None

    today = datetime.now(timezone.utc).date()
    labels = [_day_label(today - timedelta(days=days - 1 - index)) for index in range(days)]

    # Ancla el último punto al estado proyectado actual (sin adelantar horas futuras),
    # salvo que hoy se haya recolectado: se conserva el pico medido de la recolección.
    capacity = float(point.max_capacity_kg) or 1.0
    today_spike = max(
        (weight / capacity * 100.0 for moment, weight in events if moment.date() == today),
        default=0.0,
    )
    values[-1] = min(100.0, max(float(fill_level_pct(point)), today_spike))

    return {"labels": labels, "values": [int(round(value)) for value in values]}


def collection_point_fill_history(
    db: Session,
    code: str,
    user: User,
    *,
    days: int = 7,
) -> dict[str, Any]:
    if days < 1 or days > 30:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El parámetro days debe estar entre 1 y 30",
        )

    point = _resolve_collection_point(db, code, user)
    waypoint_series = _history_from_waypoints(db, point, days)
    if waypoint_series is not None:
        series = waypoint_series
        source = "waypoints"
    else:
        series = _simulated_fill_history(point, days)
        source = "simulated"

    return {
        "code": point.code,
        "days": days,
        "source": source,
        "labels": series["labels"],
        "values": series["values"],
    }


def collection_points_fill_forecast(
    db: Session,
    *,
    days: int = 7,
    sector_id: int | None = None,
) -> dict[str, Any]:
    """Simulación multi-día: qué contenedores cruzarían el umbral crítico cada día.

    La proyección usa el estado actual (``last_emptied_at`` / llenado sembrado) y la
    tasa de generación de cada contenedor. Es la base para frecuencias de visita y
    para que el escenario "saturado" emerja de los datos.
    """
    now = datetime.now(timezone.utc)
    today = now.date()
    points = db.scalars(
        select(CollectionPoint)
        .where(
            CollectionPoint.deleted_at.is_(None),
            CollectionPoint.status == "active",
            (CollectionPoint.sector_id == sector_id) if sector_id is not None else True,
        )
        .options(joinedload(CollectionPoint.sector))
    ).all()

    per_day: list[dict[str, Any]] = [
        {
            "date": (today + timedelta(days=index)).isoformat(),
            "criticalCount": 0,
            "codes": [],
        }
        for index in range(days)
    ]

    for point in points:
        offset = critical_day_offset(point, days=days, at=now)
        if offset is None:
            continue
        per_day[offset]["codes"].append(point.code)
        per_day[offset]["criticalCount"] += 1

    for entry in per_day:
        entry["codes"].sort()

    today_codes = per_day[0]["codes"] if per_day else []
    return {
        "days": days,
        "generatedAt": now.isoformat(),
        "criticalThresholdPct": CRITICAL_FILL_PCT,
        "activePointCount": len(points),
        "currentlyCritical": today_codes,
        "perDay": per_day,
    }


def list_sector_options(db: Session) -> list[dict[str, Any]]:
    sectors = db.scalars(
        select(Sector).where(Sector.deleted_at.is_(None)).order_by(Sector.name)
    ).all()
    return [
        {
            "id": sector.id,
            "name": sector.name,
            "fillRateFactor": float(getattr(sector, "fill_rate_factor", None) or 1.0),
            "generationRateKgPerDay": effective_zone_rate_kg_per_day(sector),
            "perCapitaKgPerDay": (
                float(sector.per_capita_kg_per_day)
                if getattr(sector, "per_capita_kg_per_day", None) is not None
                else None
            ),
            "population": (
                int(sector.population)
                if getattr(sector, "population", None) is not None
                else None
            ),
            "distributionMode": getattr(sector, "distribution_mode", None) or "equal",
        }
        for sector in sectors
    ]


def _get_point_by_code(db: Session, code: str) -> CollectionPoint:
    point = db.scalar(
        select(CollectionPoint)
        .where(CollectionPoint.code == code, CollectionPoint.deleted_at.is_(None))
        .options(joinedload(CollectionPoint.sector))
    )
    if point is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Punto de recolección no encontrado: {code}",
        )
    return point


def _validate_coordinates(longitude: float, latitude: float) -> None:
    lon_min, lat_min, lon_max, lat_max = UNARE_BBOX
    if not (lon_min <= longitude <= lon_max and lat_min <= latitude <= lat_max):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Las coordenadas están fuera del área de estudio de la parroquia Unare",
        )


def _validate_fill_level(current_fill: Decimal, capacity: Decimal) -> None:
    if current_fill < 0 or current_fill > capacity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El nivel de llenado debe estar entre 0 y la capacidad máxima",
        )


def _snap_road_node(longitude: float, latitude: float) -> int | None:
    try:
        graph = load_road_graph()
        return int(nearest_node(graph, longitude, latitude))
    except Exception:
        logger.warning("No se pudo asignar road_node_id para (%s, %s)", longitude, latitude, exc_info=True)
        return None


def _persist_point(
    db: Session,
    point: CollectionPoint,
    *,
    redistribute_sector_ids: Iterable[int] = (),
) -> dict[str, Any]:
    db.add(point)
    db.flush()
    for sector_id in {sid for sid in redistribute_sector_ids if sid is not None}:
        sector = db.get(Sector, sector_id)
        if sector is not None:
            distribute_sector_generation_rate(db, sector)
    db.commit()
    db.refresh(point)
    point = db.scalar(
        select(CollectionPoint)
        .where(CollectionPoint.id == point.id)
        .options(joinedload(CollectionPoint.sector))
    )
    assert point is not None
    return serialize_collection_point_detail(point)


def _validate_generation_rate_scope(sector: Any, value: float | None) -> None:
    """Una tasa por contenedor no convive con una tasa gestionada por la zona."""
    if value is None:
        return
    if effective_zone_rate_kg_per_day(sector) is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "La zona ya define una tasa de generación; quítala a nivel de zona "
                "para gestionarla por contenedor"
            ),
        )


def create_collection_point(db: Session, payload: CollectionPointCreate) -> dict[str, Any]:
    code = payload.code.strip().upper()
    existing = db.scalar(
        select(CollectionPoint).where(
            CollectionPoint.code == code,
            CollectionPoint.deleted_at.is_(None),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un punto con el código {code}",
        )

    sector = db.get(Sector, payload.sector_id)
    if sector is None or sector.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sector no encontrado",
        )

    _validate_coordinates(payload.longitude, payload.latitude)
    capacity = Decimal(str(payload.max_capacity_kg))
    fill = Decimal(str(payload.current_fill_level_kg if payload.current_fill_level_kg is not None else 0))
    _validate_fill_level(fill, capacity)
    _validate_generation_rate_scope(sector, payload.generation_rate_kg_per_day)

    point = CollectionPoint(
        sector_id=payload.sector_id,
        code=code,
        latitude=Decimal(str(payload.latitude)),
        longitude=Decimal(str(payload.longitude)),
        max_capacity_kg=capacity,
        current_fill_level_kg=fill,
        status=payload.status or "active",
        road_node_id=_snap_road_node(payload.longitude, payload.latitude),
        fill_rate_factor_override=(
            Decimal(str(payload.fill_rate_factor_override))
            if payload.fill_rate_factor_override is not None
            else None
        ),
        generation_rate_kg_per_day=(
            Decimal(str(payload.generation_rate_kg_per_day))
            if payload.generation_rate_kg_per_day is not None
            else None
        ),
        served_population=(
            Decimal(str(payload.served_population))
            if payload.served_population is not None
            else None
        ),
    )
    if payload.estimated_fill_hours is not None:
        point.estimated_fill_hours = Decimal(str(payload.estimated_fill_hours))
    return _persist_point(db, point, redistribute_sector_ids=(point.sector_id,))


def update_collection_point(
    db: Session,
    code: str,
    payload: CollectionPointUpdate,
) -> dict[str, Any]:
    point = _get_point_by_code(db, code)
    previous_sector_id = point.sector_id
    data = payload.model_dump(exclude_unset=True)

    if "sector_id" in data:
        sector = db.get(Sector, data["sector_id"])
        if sector is None or sector.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sector no encontrado",
            )
        point.sector_id = data["sector_id"]

    longitude = float(data["longitude"]) if "longitude" in data else float(point.longitude)
    latitude = float(data["latitude"]) if "latitude" in data else float(point.latitude)
    if "longitude" in data or "latitude" in data:
        _validate_coordinates(longitude, latitude)
        point.longitude = Decimal(str(longitude))
        point.latitude = Decimal(str(latitude))
        point.road_node_id = _snap_road_node(longitude, latitude)

    capacity = Decimal(str(data["max_capacity_kg"])) if "max_capacity_kg" in data else point.max_capacity_kg
    fill = (
        Decimal(str(data["current_fill_level_kg"]))
        if "current_fill_level_kg" in data
        else point.current_fill_level_kg
    )
    if "max_capacity_kg" in data:
        point.max_capacity_kg = capacity
    if "current_fill_level_kg" in data:
        point.current_fill_level_kg = fill
    _validate_fill_level(fill, capacity)

    if "status" in data and data["status"] is not None:
        point.status = data["status"]

    if "priority_boost" in data and data["priority_boost"] is not None:
        point.priority_boost = data["priority_boost"]

    if "fill_rate_factor_override" in data:
        raw = data["fill_rate_factor_override"]
        point.fill_rate_factor_override = Decimal(str(raw)) if raw is not None else None

    if "estimated_fill_hours" in data and data["estimated_fill_hours"] is not None:
        point.estimated_fill_hours = Decimal(str(data["estimated_fill_hours"]))

    if "generation_rate_kg_per_day" in data:
        raw_rate = data["generation_rate_kg_per_day"]
        if raw_rate is not None:
            _validate_generation_rate_scope(db.get(Sector, point.sector_id), raw_rate)
        point.generation_rate_kg_per_day = Decimal(str(raw_rate)) if raw_rate is not None else None

    if "served_population" in data:
        raw_population = data["served_population"]
        point.served_population = (
            Decimal(str(raw_population)) if raw_population is not None else None
        )

    return _persist_point(
        db,
        point,
        redistribute_sector_ids=(point.sector_id, previous_sector_id),
    )


def delete_collection_point(db: Session, code: str) -> dict[str, Any]:
    point = _get_point_by_code(db, code)
    sector = db.get(Sector, point.sector_id)
    point.deleted_at = datetime.now(timezone.utc)
    point.status = "inactive"
    db.add(point)
    db.flush()
    if sector is not None:
        distribute_sector_generation_rate(db, sector)
    db.commit()
    return {"code": point.code, "deleted": True}


def _export_status_label(bucket: str) -> str:
    return STATUS_LABELS.get(bucket, bucket)


def _matches_status_filter(point: CollectionPoint, status_filter: str | None) -> bool:
    if not status_filter:
        return True
    fill_level = fill_level_pct(point)
    bucket = fill_status_from_level(fill_level, point_status=point.status)
    frontend_status = _frontend_status(bucket)
    return frontend_status == status_filter


def export_collection_points_csv(
    db: Session,
    user: User,
    *,
    sector: str | None = None,
    status: str | None = None,
) -> str:
    if user.role == UserRole.residente:
        if user.sector_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario no tiene sector asignado",
            )
        stmt = (
            select(CollectionPoint)
            .where(
                CollectionPoint.sector_id == user.sector_id,
                CollectionPoint.deleted_at.is_(None),
            )
            .options(joinedload(CollectionPoint.sector))
            .order_by(CollectionPoint.code)
        )
    else:
        stmt = (
            select(CollectionPoint)
            .where(CollectionPoint.deleted_at.is_(None))
            .options(joinedload(CollectionPoint.sector))
            .order_by(CollectionPoint.code)
        )

    points = db.scalars(stmt).all()
    meta_by_code = seed_meta_by_code()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "sector",
            "fill_level_pct",
            "status",
            "latitude",
            "longitude",
            "last_collection",
        ]
    )

    for point in points:
        sector_name = point.sector.name if point.sector else ""
        if sector and sector_name != sector:
            continue
        if not _matches_status_filter(point, status):
            continue

        fill_level = fill_level_pct(point)
        status_bucket = fill_status_from_level(fill_level, point_status=point.status)
        meta = meta_by_code.get(point.code, {})
        last_collection = _format_last_collection(meta.get("lastCollection"), point.last_emptied_at)

        writer.writerow(
            [
                point.code,
                sector_name,
                fill_level,
                _export_status_label(status_bucket),
                float(point.latitude),
                float(point.longitude),
                last_collection,
            ]
        )

    return buffer.getvalue()


def _scoped_active_points(db: Session, user: User) -> list[CollectionPoint]:
    if user.role == UserRole.residente:
        if user.sector_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario no tiene sector asignado",
            )
        stmt = (
            select(CollectionPoint)
            .where(
                CollectionPoint.sector_id == user.sector_id,
                CollectionPoint.deleted_at.is_(None),
            )
            .options(joinedload(CollectionPoint.sector))
            .order_by(CollectionPoint.code)
        )
    else:
        stmt = (
            select(CollectionPoint)
            .where(CollectionPoint.deleted_at.is_(None))
            .options(joinedload(CollectionPoint.sector))
            .order_by(CollectionPoint.code)
        )
    return list(db.scalars(stmt).all())


def _last_optimization_point_codes(db: Session) -> tuple[set[str], datetime | None]:
    latest_calculated = db.scalar(
        select(OptimizedRoute.calculated_at)
        .where(OptimizedRoute.route_kind == "optimized")
        .order_by(OptimizedRoute.calculated_at.desc())
        .limit(1)
    )
    if latest_calculated is None:
        return set(), None

    routes = list(
        db.scalars(
            select(OptimizedRoute)
            .where(
                OptimizedRoute.route_kind == "optimized",
                OptimizedRoute.calculated_at == latest_calculated,
            )
            .options(
                joinedload(OptimizedRoute.waypoints).joinedload(RouteWaypoint.collection_point),
            )
        ).unique().all()
    )

    codes: set[str] = set()
    for route in routes:
        for waypoint in route.waypoints:
            if waypoint.collection_point is not None:
                codes.add(waypoint.collection_point.code)
    return codes, latest_calculated


def collection_points_optimization_context(db: Session, user: User) -> dict[str, Any]:
    points = _scoped_active_points(db, user)
    last_codes, last_at = _last_optimization_point_codes(db)

    schedules = db.scalars(
        select(VisitSchedule).where(
            VisitSchedule.collection_point_id.in_([point.id for point in points])
        )
    ).all()
    declared_by_point = {
        schedule.collection_point_id: schedule.visits_per_week for schedule in schedules
    }

    critical_count = 0
    priority_boost_codes: list[str] = []
    overloaded_codes: list[str] = []
    for point in points:
        if bool(getattr(point, "priority_boost", False)):
            priority_boost_codes.append(point.code)
        fill_level = fill_level_pct(point)
        if point.status == "active" and is_critical_now(fill_level):
            critical_count += 1
        required = required_visits_per_week(point)
        if is_overloaded(required, declared_by_point.get(point.id)):
            overloaded_codes.append(point.code)

    return {
        "lastOptimizedCodes": sorted(last_codes),
        "lastOptimizedAt": last_at.isoformat() if last_at else None,
        "priorityBoostCodes": sorted(priority_boost_codes),
        "criticalCount": critical_count,
        "overloadedCodes": sorted(overloaded_codes),
    }
