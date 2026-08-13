"""Horario de recolección del residente (plan semanal, frecuencias o fallback)."""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, VisitSchedule, WeeklyPlan, WeeklyPlanDay
from app.services.planning_service import _json_list, monday_of_week, week_range

ScheduleSource = Literal["weekly_plan", "visit_schedules", "default", "none"]

DEFAULT_COLLECTION_WINDOW = "07:00 — 12:00"
DEFAULT_COLLECTION_START = time(7, 0)
DEFAULT_COLLECTION_END = time(12, 0)
DEFAULT_WEEKDAYS = (0, 2, 4)  # Lunes, miércoles, viernes — fallback documentado

SPANISH_WEEKDAYS = (
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
)


def _weekday_label(value: date) -> str:
    return SPANISH_WEEKDAYS[value.weekday()]


def _format_collection_days(weekdays: set[int]) -> str:
    ordered = [SPANISH_WEEKDAYS[day] for day in sorted(weekdays) if 0 <= day <= 6]
    return ", ".join(ordered) if ordered else "—"


def _sector_point_ids(db: Session, sector_id: int) -> set[int]:
    rows = db.scalars(
        select(CollectionPoint.id).where(
            CollectionPoint.sector_id == sector_id,
            CollectionPoint.deleted_at.is_(None),
            CollectionPoint.status == "active",
        )
    ).all()
    return set(rows)


def _day_serves_sector(day: WeeklyPlanDay, *, sector_id: int, sector_point_ids: set[int]) -> bool:
    sector_ids = _json_list(day.sector_ids_json)
    if sector_id in sector_ids:
        return True
    point_ids = set(_json_list(day.collection_point_ids_json))
    return bool(point_ids & sector_point_ids)


def _collection_dates_from_weekly_plan(
    db: Session,
    *,
    sector_id: int,
    sector_point_ids: set[int],
    from_date: date,
    until_date: date,
) -> tuple[list[date], ScheduleSource]:
    if not sector_point_ids:
        return [], "none"

    week_starts = {monday_of_week(from_date)}
    cursor = monday_of_week(from_date)
    end_monday = monday_of_week(until_date)
    while cursor <= end_monday:
        week_starts.add(cursor)
        cursor += timedelta(days=7)

    dates: set[date] = set()
    for week_start in sorted(week_starts):
        plan = db.scalar(
            select(WeeklyPlan)
            .where(WeeklyPlan.week_start_date == week_start, WeeklyPlan.status == "approved")
            .options(joinedload(WeeklyPlan.days))
        )
        if plan is None:
            continue
        for day in plan.days:
            if from_date <= day.operation_date <= until_date and _day_serves_sector(
                day,
                sector_id=sector_id,
                sector_point_ids=sector_point_ids,
            ):
                dates.add(day.operation_date)

    if dates:
        return sorted(dates), "weekly_plan"
    return [], "none"


def _weekdays_from_visit_schedules(
    db: Session,
    sector_id: int,
    sector_point_ids: set[int] | None = None,
) -> set[int]:
    point_ids = sector_point_ids if sector_point_ids is not None else _sector_point_ids(db, sector_id)
    if not point_ids:
        return set()
    schedules = db.scalars(
        select(VisitSchedule).where(VisitSchedule.collection_point_id.in_(point_ids))
    ).all()
    weekdays: set[int] = set()
    for schedule in schedules:
        if not schedule.weekdays_json:
            continue
        try:
            parsed = json.loads(schedule.weekdays_json)
            weekdays.update(int(value) for value in parsed if 0 <= int(value) <= 6)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return weekdays


def _dates_from_weekdays(weekdays: set[int], from_date: date, until_date: date) -> list[date]:
    if not weekdays:
        return []
    dates: list[date] = []
    cursor = from_date
    while cursor <= until_date:
        if cursor.weekday() in weekdays:
            dates.append(cursor)
        cursor += timedelta(days=1)
    return dates


def _next_collection_datetime(
    collection_dates: list[date],
    *,
    reference: datetime,
    window_start: time = DEFAULT_COLLECTION_START,
    window_end: time = DEFAULT_COLLECTION_END,
) -> datetime | None:
    today = reference.date()
    now_time = reference.time().replace(second=0, microsecond=0)
    for operation_date in collection_dates:
        if operation_date < today:
            continue
        if operation_date == today and now_time >= window_end:
            continue
        return datetime.combine(operation_date, window_start, tzinfo=reference.tzinfo)
    return None


def _format_next_collection_label(value: datetime | None) -> str:
    if value is None:
        return "Sin recolección programada"
    day_label = _weekday_label(value.date())
    if value.date() == date.today():
        return f"Hoy {value.strftime('%H:%M')}"
    if value.date() == date.today() + timedelta(days=1):
        return f"Mañana {value.strftime('%H:%M')}"
    return f"{day_label} {value.strftime('%d/%m/%Y')} · {value.strftime('%H:%M')}"


def build_resident_schedule(
    db: Session,
    *,
    sector_id: int,
    reference: datetime | None = None,
    horizon_days: int = 21,
) -> dict[str, Any]:
    """Construye horario del sector para el residente."""
    now = reference or datetime.now().astimezone()
    today = now.date()
    until = today + timedelta(days=horizon_days)
    sector_point_ids = _sector_point_ids(db, sector_id)

    weekly_dates, _ = _collection_dates_from_weekly_plan(
        db,
        sector_id=sector_id,
        sector_point_ids=sector_point_ids,
        from_date=today,
        until_date=until,
    )

    source: ScheduleSource = "none"
    collection_dates: list[date] = []

    if weekly_dates:
        collection_dates = weekly_dates
        source = "weekly_plan"
    elif sector_point_ids:
        weekdays = _weekdays_from_visit_schedules(db, sector_id, sector_point_ids)
        if weekdays:
            collection_dates = _dates_from_weekdays(weekdays, today, until)
            source = "visit_schedules"
        else:
            collection_dates = _dates_from_weekdays(set(DEFAULT_WEEKDAYS), today, until)
            source = "default"

    weekdays = {operation_date.weekday() for operation_date in collection_dates}
    has_plan = source == "weekly_plan" and bool(collection_dates)
    has_schedule = bool(collection_dates)

    next_dt = _next_collection_datetime(collection_dates, reference=now)
    frequency = (
        f"{len(weekdays)} {'vez' if len(weekdays) == 1 else 'veces'} por semana"
        if weekdays
        else "Sin frecuencia definida"
    )

    calendar = [
        {
            "date": operation_date.isoformat(),
            "weekday": operation_date.weekday(),
            "label": f"{_weekday_label(operation_date)} {operation_date.strftime('%d/%m/%Y')}",
        }
        for operation_date in collection_dates[:14]
    ]

    is_collection_day = today in collection_dates

    return {
        "collectionDays": _format_collection_days(weekdays) if weekdays else "—",
        "window": DEFAULT_COLLECTION_WINDOW,
        "nextCollection": _format_next_collection_label(next_dt),
        "nextCollectionAt": next_dt.isoformat() if next_dt else None,
        "frequency": frequency,
        "isCollectionDay": is_collection_day,
        "hasWeeklyPlan": has_plan,
        "hasSchedule": has_schedule,
        "source": source if has_schedule else "none",
        "calendar": calendar,
    }
