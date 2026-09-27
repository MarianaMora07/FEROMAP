"""Calibración de la tasa de generación por contenedor con pesos recolectados.

Usa el historial real de paradas (``route_waypoints.collected_weight_kg`` con su
``actual_arrival_at``) para estimar la tasa efectiva de cada contenedor mediante
un promedio exponencial (EWMA) de las muestras entre recolecciones consecutivas.

Los contenedores cuya zona gestiona la tasa (tasa manual o per cápita) se omiten:
su valor lo controla el reparto de la zona.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, RouteWaypoint
from app.domain.calibration import estimate_rate_kg_per_hour
from app.services.admin_service import get_algorithm_settings
from app.services.sector_service import effective_zone_rate_kg_per_day

KG_PER_DAY = 24.0


def _events_by_point(
    db: Session, since: datetime, sector_id: int | None
) -> dict[int, list[tuple[datetime, float]]]:
    stmt = (
        select(RouteWaypoint)
        .where(
            RouteWaypoint.collection_point_id.is_not(None),
            RouteWaypoint.collected_weight_kg.is_not(None),
        )
        .options(
            joinedload(RouteWaypoint.collection_point).joinedload(CollectionPoint.sector)
        )
    )
    if sector_id is not None:
        stmt = stmt.where(
            RouteWaypoint.collection_point_id.in_(
                select(CollectionPoint.id).where(CollectionPoint.sector_id == sector_id)
            )
        )

    events: dict[int, list[tuple[datetime, float]]] = {}
    for waypoint in db.scalars(stmt).all():
        moment = waypoint.actual_arrival_at or waypoint.updated_at
        if moment is None or moment < since:
            continue
        if waypoint.collection_point_id is None or waypoint.collected_weight_kg is None:
            continue
        events.setdefault(waypoint.collection_point_id, []).append(
            (moment, float(waypoint.collected_weight_kg))
        )

    for rows in events.values():
        rows.sort(key=lambda item: item[0])
    return events


def calibrate_collection_points(
    db: Session,
    *,
    days: int | None = None,
    alpha: float | None = None,
    sector_id: int | None = None,
) -> dict[str, Any]:
    algorithm = get_algorithm_settings(db)
    window_days = days if days is not None else algorithm.calibration_window_days
    alpha_value = alpha if alpha is not None else algorithm.calibration_default_alpha
    since = datetime.now(timezone.utc) - timedelta(days=max(1, window_days))

    events_by_point = _events_by_point(db, since, sector_id)
    calibrated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    points_by_id = {
        point.id: point
        for point in db.scalars(
            select(CollectionPoint)
            .where(CollectionPoint.deleted_at.is_(None))
            .options(joinedload(CollectionPoint.sector))
        ).all()
    }

    now = datetime.now(timezone.utc)
    for point_id, rows in events_by_point.items():
        point = points_by_id.get(point_id)
        if point is None:
            continue
        sector = getattr(point, "sector", None)
        if effective_zone_rate_kg_per_day(sector) is not None:
            skipped.append({"code": point.code, "reason": "zone_managed"})
            continue

        rate_kg_per_hour, samples = estimate_rate_kg_per_hour(rows, alpha=alpha_value)
        if rate_kg_per_hour is None or samples < 1:
            skipped.append({"code": point.code, "reason": "insufficient_samples"})
            continue

        previous = (
            float(point.generation_rate_kg_per_day)
            if getattr(point, "generation_rate_kg_per_day", None) is not None
            else None
        )
        rate_kg_per_day = round(rate_kg_per_hour * KG_PER_DAY, 2)
        point.generation_rate_kg_per_day = Decimal(str(rate_kg_per_day))
        point.last_calibrated_at = now
        point.calibration_samples = int(samples)
        calibrated.append(
            {
                "code": point.code,
                "samples": int(samples),
                "previousRateKgPerDay": previous,
                "rateKgPerDay": rate_kg_per_day,
            }
        )

    db.commit()
    return {
        "windowDays": window_days,
        "alpha": alpha_value,
        "calibratedCount": len(calibrated),
        "skippedCount": len(skipped),
        "calibrated": calibrated,
        "skipped": skipped,
    }
