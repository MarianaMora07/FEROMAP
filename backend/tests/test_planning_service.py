"""Tests del servicio de planificación operativa."""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services.planning_service import (
    consolidate_daily_points,
    create_pending_visit,
    create_weekly_plan_draft,
    monday_of_week,
    week_range,
)


def test_monday_of_week_normalizes_to_monday():
    wednesday = date(2026, 8, 12)
    assert monday_of_week(wednesday) == date(2026, 8, 10)


def test_week_range_returns_seven_days():
    start, end = week_range(date(2026, 8, 12))
    assert start == date(2026, 8, 10)
    assert end == date(2026, 8, 16)


def test_create_weekly_plan_draft_rejects_duplicate_week():
    db = MagicMock()
    db.scalar.return_value = object()
    with pytest.raises(HTTPException) as exc:
        create_weekly_plan_draft(
            db,
            week_start_date=date(2026, 8, 10),
            scenario_id="normal",
            days=[],
        )
    assert exc.value.status_code == 400


def test_consolidate_daily_points_requires_points():
    db = MagicMock()
    plan = MagicMock()
    plan.operation_date = date.today()
    plan.scheduled_point_ids_json = "[]"
    db.get.return_value = plan
    db.scalars.return_value.all.return_value = []
    with pytest.raises(HTTPException) as exc:
        consolidate_daily_points(db, 1)
    assert exc.value.status_code == 400


def test_create_pending_visit_deduplicates_open_entries():
    db = MagicMock()
    existing = MagicMock()
    db.scalar.return_value = existing
    result = create_pending_visit(
        db,
        collection_point_id=5,
        origin_operation_date=date.today(),
        reason="not_visited",
    )
    assert result is existing
