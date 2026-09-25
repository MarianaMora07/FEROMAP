"""Tests del servicio de planificación operativa."""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services.planning_service import (
    close_daily_plan,
    consolidate_daily_points,
    create_pending_visit,
    create_weekly_plan_draft,
    delete_weekly_plan,
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


def test_close_daily_plan_skips_waypoints_without_collection_point(monkeypatch):
    """Regresión: los waypoints de vertedero/base (``collection_point_id`` NULL) no generan pendientes.

    Antes, `close_daily_plan` intentaba crear una ``PendingVisit`` con `collection_point_id=None`
    y PostgreSQL lanzaba ``NotNullViolation`` (500 al cerrar el día).
    """
    from types import SimpleNamespace

    plan = SimpleNamespace(
        id=1,
        status="dispatched",
        closed_at=None,
        operation_date=date(2026, 9, 25),
        final_point_ids_json=None,
        scheduled_point_ids_json=None,
    )
    landfill = SimpleNamespace(
        id=99, status="pending", collection_point_id=None, waypoint_type="landfill"
    )
    stop = SimpleNamespace(id=100, status="pending", collection_point_id=7, waypoint_type="collection")
    route = SimpleNamespace(waypoints=[landfill, stop])

    db = MagicMock()
    db.get.return_value = plan
    routes_result = MagicMock()
    routes_result.unique.return_value.all.return_value = [route]
    incidents_result = MagicMock()
    incidents_result.all.return_value = []
    db.scalars.side_effect = [routes_result, incidents_result]

    create_visit = MagicMock()
    monkeypatch.setattr("app.services.planning_service.create_pending_visit", create_visit)
    monkeypatch.setattr("app.services.planning_service._record_version", lambda *a, **k: None)
    monkeypatch.setattr("app.services.planning_service.dump_kpi_json", lambda payload: None)
    monkeypatch.setattr("app.services.planning_service.plan_vs_real_from_routes", lambda *a, **k: {})
    monkeypatch.setattr("app.services.operations_service.route_actual_distance_km", lambda r: None)

    result = close_daily_plan(db, 1, user_id=2)

    assert result["status"] == "partial"
    create_visit.assert_called_once()
    assert create_visit.call_args.kwargs["collection_point_id"] == 7


def test_delete_weekly_plan_missing_returns_404():
    db = MagicMock()
    db.scalar.return_value = None
    with pytest.raises(HTTPException) as exc:
        delete_weekly_plan(db, 99)
    assert exc.value.status_code == 404
    db.delete.assert_not_called()


def test_delete_weekly_plan_rejects_non_draft():
    db = MagicMock()
    plan = MagicMock()
    plan.status = "approved"
    db.scalar.return_value = plan
    with pytest.raises(HTTPException) as exc:
        delete_weekly_plan(db, 7)
    assert exc.value.status_code == 400
    db.delete.assert_not_called()


def test_delete_weekly_plan_removes_draft_and_unlinks_daily_plans():
    db = MagicMock()
    plan = MagicMock()
    plan.status = "draft"
    plan.id = 7
    day = MagicMock()
    day.id = 3
    plan.days = [day]
    db.scalar.return_value = plan
    result = delete_weekly_plan(db, 7)
    assert result == {"id": 7, "deleted": True}
    # Desvincula weekly_plan_day_id, weekly_plan_id y borra versiones.
    assert db.execute.call_count == 3
    db.delete.assert_called_once_with(plan)
