"""Próxima recolección real por contenedor (plan semanal aprobado > agenda declarada).

Fuente única para el KPI de riesgo de rebose, las alertas de tipo ``agenda``, el
sesgo ACO (``at_risk_flags``) y el resumen del residente. Antes cada consumidor
resolvía la visita por su cuenta y solo miraba ``visit_schedules``: el residente
usaba el plan semanal y la criticidad una agenda que el plan podía no respetar,
así que dos pantallas daban "próximas visitas" distintas.

Regla: la primera recolección **planificada** (plan semanal aprobado) manda; si el
punto no aparece en ningún día planificado del horizonte, se cae a su agenda
declarada. Un punto sin plan ni agenda **no es evaluable** (no se inventa la visita).

Cada visita resuelta declara su ``source``, para que el consumidor pueda decir de
dónde sale la fecha ("según plan" vs "según agenda") en vez de presentar ambas
como si fueran lo mismo.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import CollectionPoint, VisitSchedule, WeeklyPlan, WeeklyPlanDay
from app.domain.criticality import (
    hours_until_local_date,
    next_visit_local_date,
    operational_today,
)

# Horizonte de búsqueda del plan: más que las ~3 semanas que abarcan los planes.
DEFAULT_HORIZON_DAYS = 28

# Origen de la fecha de recolección.
SOURCE_PLAN = "plan"
SOURCE_AGENDA = "agenda"


@dataclass(frozen=True)
class NextVisit:
    """Próxima recolección de un contenedor y de dónde salió la fecha."""

    hours: float
    source: str
    local_date: date


def declared_weekdays_by_point(db: Session) -> dict[int, list[int]]:
    """Días declarados (0=lunes..6=domingo) por punto, desde ``visit_schedules``."""
    weekdays_by_point: dict[int, list[int]] = {}
    for schedule in db.scalars(select(VisitSchedule)).all():
        raw = getattr(schedule, "weekdays_json", None)
        point_id = getattr(schedule, "collection_point_id", None)
        if raw is None or point_id is None:
            continue
        try:
            parsed = [int(value) for value in json.loads(raw)]
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if parsed:
            weekdays_by_point[point_id] = parsed
    return weekdays_by_point


def _json_list(raw: Any) -> list[int]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    values: list[int] = []
    for item in parsed:
        try:
            values.append(int(item))
        except (TypeError, ValueError):
            continue
    return values


def _sector_points(db: Session) -> dict[int, set[int]]:
    """Puntos en servicio por sector (solo si el plan trae sectores sin puntos)."""
    mapping: dict[int, set[int]] = {}
    rows = db.execute(select(CollectionPoint.id, CollectionPoint.sector_id)).all()
    for row in rows:
        try:
            point_id, sector_id = int(row[0]), int(row[1])
        except (TypeError, ValueError, IndexError):
            continue
        mapping.setdefault(sector_id, set()).add(point_id)
    return mapping


def planned_dates_by_point(
    db: Session, *, today: date, horizon_days: int = DEFAULT_HORIZON_DAYS
) -> dict[int, set[date]]:
    """Fechas planificadas por punto en los planes semanales aprobados del horizonte."""
    until = today + timedelta(days=horizon_days)
    days = db.scalars(
        select(WeeklyPlanDay)
        .join(WeeklyPlan, WeeklyPlan.id == WeeklyPlanDay.weekly_plan_id)
        .where(
            WeeklyPlan.status == "approved",
            WeeklyPlanDay.operation_date >= today,
            WeeklyPlanDay.operation_date <= until,
        )
    ).all()

    rows = list(days)
    needs_sector_expansion = any(
        _json_list(getattr(day, "sector_ids_json", None))
        and not _json_list(getattr(day, "collection_point_ids_json", None))
        for day in rows
    )
    sector_points = _sector_points(db) if needs_sector_expansion else {}

    planned: dict[int, set[date]] = {}
    for day in rows:
        operation_date = getattr(day, "operation_date", None)
        if not isinstance(operation_date, date):
            continue
        point_ids = set(_json_list(getattr(day, "collection_point_ids_json", None)))
        for sector_id in _json_list(getattr(day, "sector_ids_json", None)):
            point_ids |= sector_points.get(sector_id, set())
        for point_id in point_ids:
            planned.setdefault(point_id, set()).add(operation_date)
    return planned


def next_visits_by_point(
    db: Session,
    *,
    at: datetime | None = None,
    tz_name: str | None = None,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> dict[int, NextVisit]:
    """Próxima recolección por punto con su origen (plan aprobado > agenda).

    Los puntos sin fecha planificada ni agenda declarada quedan fuera del mapa:
    son los no evaluables que el dashboard reporta como cobertura.
    """
    zone_name = tz_name or settings.operational_timezone
    today = operational_today(at=at, tz_name=zone_name)

    visits: dict[int, NextVisit] = {}
    for point_id, dates in planned_dates_by_point(
        db, today=today, horizon_days=horizon_days
    ).items():
        for operation_date in sorted(dates):
            value = hours_until_local_date(operation_date, at=at, tz_name=zone_name)
            if value > 0:
                visits[point_id] = NextVisit(
                    hours=value, source=SOURCE_PLAN, local_date=operation_date
                )
                break

    for point_id, weekdays in declared_weekdays_by_point(db).items():
        if point_id in visits:
            continue
        local_date = next_visit_local_date(
            weekdays=weekdays, at=at, tz_name=zone_name
        )
        if local_date is None:
            continue
        visits[point_id] = NextVisit(
            hours=hours_until_local_date(local_date, at=at, tz_name=zone_name),
            source=SOURCE_AGENDA,
            local_date=local_date,
        )

    return visits
