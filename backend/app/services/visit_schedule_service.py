"""Frecuencias de visita por punto de recolección."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, VisitSchedule


def _serialize_schedule(schedule: VisitSchedule, point: CollectionPoint) -> dict[str, Any]:
    weekdays: list[int] = []
    if schedule.weekdays_json:
        try:
            weekdays = [int(value) for value in json.loads(schedule.weekdays_json)]
        except (TypeError, ValueError, json.JSONDecodeError):
            weekdays = []
    return {
        "id": schedule.id,
        "collectionPointId": schedule.collection_point_id,
        "pointCode": point.code,
        "visitsPerWeek": schedule.visits_per_week,
        "weekdays": weekdays,
        "isExtraVisit": schedule.is_extra_visit,
        "effectiveFrom": schedule.effective_from.isoformat(),
        "effectiveUntil": schedule.effective_until.isoformat() if schedule.effective_until else None,
    }


def _resolve_point(db: Session, code: str) -> CollectionPoint:
    point = db.scalar(
        select(CollectionPoint)
        .where(CollectionPoint.code == code, CollectionPoint.deleted_at.is_(None))
        .options(joinedload(CollectionPoint.sector))
    )
    if point is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Punto no encontrado: {code}")
    return point


def get_visit_schedule(db: Session, code: str) -> dict[str, Any] | None:
    point = _resolve_point(db, code)
    schedule = db.scalar(select(VisitSchedule).where(VisitSchedule.collection_point_id == point.id))
    if schedule is None:
        return None
    return _serialize_schedule(schedule, point)


def upsert_visit_schedule(
    db: Session,
    code: str,
    *,
    visits_per_week: int,
    weekdays: list[int],
    is_extra_visit: bool = False,
    effective_from: date | None = None,
    effective_until: date | None = None,
) -> dict[str, Any]:
    if visits_per_week < 1 or visits_per_week > 7:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="visitsPerWeek debe estar entre 1 y 7")
    normalized_weekdays = sorted({int(day) for day in weekdays if 0 <= int(day) <= 6})
    if not normalized_weekdays:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe indicar al menos un día de la semana")

    point = _resolve_point(db, code)
    schedule = db.scalar(select(VisitSchedule).where(VisitSchedule.collection_point_id == point.id))
    if schedule is None:
        schedule = VisitSchedule(
            collection_point_id=point.id,
            visits_per_week=visits_per_week,
            weekdays_json=json.dumps(normalized_weekdays),
            is_extra_visit=is_extra_visit,
            effective_from=effective_from or date.today(),
            effective_until=effective_until,
        )
        db.add(schedule)
    else:
        schedule.visits_per_week = visits_per_week
        schedule.weekdays_json = json.dumps(normalized_weekdays)
        schedule.is_extra_visit = is_extra_visit
        if effective_from is not None:
            schedule.effective_from = effective_from
        schedule.effective_until = effective_until

    db.flush()
    return _serialize_schedule(schedule, point)


def list_active_visit_schedules(db: Session, *, reference: date | None = None) -> list[dict[str, Any]]:
    ref = reference or date.today()
    schedules = db.scalars(
        select(VisitSchedule)
        .options(joinedload(VisitSchedule.collection_point))
        .order_by(VisitSchedule.collection_point_id)
    ).all()
    active: list[dict[str, Any]] = []
    for schedule in schedules:
        point = schedule.collection_point
        if point is None or point.deleted_at is not None or point.status != "active":
            continue
        if schedule.effective_from > ref:
            continue
        if schedule.effective_until is not None and schedule.effective_until < ref:
            continue
        active.append(_serialize_schedule(schedule, point))
    return active
