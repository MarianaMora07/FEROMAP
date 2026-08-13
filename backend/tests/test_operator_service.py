"""Tests del snapshot de ruta del operador."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.db.models import UserRole
from app.services.operator_service import _empty_snapshot, operator_route_snapshot


def test_empty_snapshot_shape():
    payload = _empty_snapshot(date(2026, 8, 13))
    assert payload["operationDate"] == "2026-08-13"
    assert payload["stops"] == []
    assert payload["stopsTotal"] == 0
    assert payload["totalDistanceKm"] is None
    assert payload["dailyPlanClosedAt"] is None


def test_operator_route_snapshot_without_driver_profile():
    db = MagicMock()
    user = SimpleNamespace(role=UserRole.conductor, driver_profile=None)
    payload = operator_route_snapshot(db, user)
    assert payload["stops"] == []
    assert payload["routeId"] is None
