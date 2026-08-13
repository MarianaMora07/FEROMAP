"""Tests del horario de recolección para residentes."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.planning_service import monday_of_week
from app.services.resident_schedule_service import (
    DEFAULT_WEEKDAYS,
    build_resident_schedule,
)


def _weekly_day(operation_date: date, point_ids: list[int], sector_ids: list[int] | None = None):
    return SimpleNamespace(
        operation_date=operation_date,
        collection_point_ids_json=json.dumps(point_ids),
        sector_ids_json=json.dumps(sector_ids or []),
    )


def _weekly_plan(week_start: date, days: list):
    return SimpleNamespace(
        week_start_date=week_start,
        status="approved",
        days=days,
    )


def test_build_schedule_from_approved_weekly_plan():
    db = MagicMock()
    sector_id = 5
    sector_points = [101, 102]
    week_start = monday_of_week(date(2026, 8, 10))
    wednesday = week_start + timedelta(days=2)
    friday = week_start + timedelta(days=4)

    def scalar_side_effect(stmt):
        sql = str(stmt)
        if "weekly_plans" in sql.lower():
            return _weekly_plan(
                week_start,
                [
                    _weekly_day(week_start, [999]),
                    _weekly_day(wednesday, [101, 999]),
                    _weekly_day(friday, [102]),
                ],
            )
        return None

    def scalars_side_effect(_stmt):
        result = MagicMock()
        result.all.return_value = sector_points
        return result

    db.scalars.side_effect = scalars_side_effect
    db.scalar.side_effect = scalar_side_effect

    reference = datetime(2026, 8, 10, 8, 0, tzinfo=timezone.utc)  # lunes
    schedule = build_resident_schedule(db, sector_id=sector_id, reference=reference)

    assert schedule["source"] == "weekly_plan"
    assert schedule["hasWeeklyPlan"] is True
    assert schedule["isCollectionDay"] is False
    assert "Miércoles" in schedule["collectionDays"]
    assert "Viernes" in schedule["collectionDays"]
    assert "Miércoles" in schedule["nextCollection"] or "11/08" in schedule["nextCollection"]
    assert len(schedule["calendar"]) >= 2


def test_build_schedule_empty_when_sector_has_no_points():
    db = MagicMock()
    db.scalars.return_value.all.return_value = []

    schedule = build_resident_schedule(
        db,
        sector_id=99,
        reference=datetime(2026, 8, 10, 8, 0, tzinfo=timezone.utc),
    )

    assert schedule["hasSchedule"] is False
    assert schedule["source"] == "none"
    assert schedule["nextCollection"] == "Sin recolección programada"


def test_build_schedule_fallback_to_visit_schedules():
    db = MagicMock()
    sector_id = 3
    sector_points = [11, 12]

    visit_schedule = SimpleNamespace(
        weekdays_json=json.dumps(list(DEFAULT_WEEKDAYS)),
    )

    scalars_returns = iter([sector_points, [visit_schedule]])

    def scalars_side_effect(_stmt):
        result = MagicMock()
        result.all.return_value = next(scalars_returns)
        return result

    db.scalars.side_effect = scalars_side_effect
    db.scalar.return_value = None

    reference = datetime(2026, 8, 12, 8, 0, tzinfo=timezone.utc)  # miércoles
    schedule = build_resident_schedule(db, sector_id=sector_id, reference=reference)

    assert schedule["source"] == "visit_schedules"
    assert schedule["hasSchedule"] is True
    assert schedule["isCollectionDay"] is True
