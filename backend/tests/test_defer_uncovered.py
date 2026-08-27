"""Tests de defer de puntos no cubiertos (Fase 3)."""

from __future__ import annotations

import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.planning_service import defer_uncovered_points_from_daily_plan


def _make_db(*, plan, simulation, points):
    db = MagicMock()

    def get(model, pk):
        if pk == plan.id:
            return plan
        if simulation and pk == simulation.id:
            return simulation
        return None

    db.get = get
    db.scalars.return_value.all.return_value = points
    db.flush = MagicMock()
    return db


def test_defer_uncovered_no_codes_returns_zero():
    plan = SimpleNamespace(id=1, operation_date=date(2026, 8, 27), simulation_id=10)
    simulation = SimpleNamespace(
        id=10,
        parameters_json=json.dumps({"kpis": {"uncoveredPointCodes": []}}),
    )
    db = _make_db(plan=plan, simulation=simulation, points=[])

    result = defer_uncovered_points_from_daily_plan(db, 1)

    assert result["created"] == 0
    assert "No hay puntos no cubiertos" in result["message"]


def test_defer_uncovered_creates_pending_visits():
    plan = SimpleNamespace(id=1, operation_date=date(2026, 8, 27), simulation_id=10)
    simulation = SimpleNamespace(
        id=10,
        parameters_json=json.dumps({"kpis": {"uncoveredPointCodes": ["C-001", "C-002"]}}),
    )
    points = [
        SimpleNamespace(id=101, code="C-001"),
        SimpleNamespace(id=102, code="C-002"),
    ]
    db = _make_db(plan=plan, simulation=simulation, points=points)
    target = date(2026, 8, 28)

    with patch("app.services.planning_service.create_pending_visit") as create_mock:
        create_mock.return_value = MagicMock()
        result = defer_uncovered_points_from_daily_plan(db, 1, target_operation_date=target)

    assert result["created"] == 2
    assert result["targetOperationDate"] == "2026-08-28"
    assert create_mock.call_count == 2
    create_mock.assert_any_call(
        db,
        collection_point_id=101,
        origin_operation_date=date(2026, 8, 27),
        target_operation_date=target,
        reason="uncovered_optimization",
        priority=120,
    )


def test_defer_uncovered_requires_simulation():
    plan = SimpleNamespace(id=1, operation_date=date.today(), simulation_id=None)
    db = _make_db(plan=plan, simulation=None, points=[])

    with pytest.raises(HTTPException) as exc:
        defer_uncovered_points_from_daily_plan(db, 1)

    assert exc.value.status_code == 400
