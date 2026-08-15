"""Tests del snapshot de ruta del operador."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.db.models import UserRole
from app.services import operator_service
from app.services.operator_service import _empty_snapshot, operator_route_snapshot
from tests.resident_fixtures import collection_point, optimized_route, waypoint


def _make_waypoints(count: int = 2):
    points = []
    for idx in range(count):
        point = collection_point(
            f"CNT-{idx:03d}",
            lng=-62.712 + idx * 0.003,
            lat=8.297 + idx * 0.002,
        )
        point.sector = SimpleNamespace(name="Unare I")
        point.id = idx + 1
        points.append(point)
    waypoints = [
        waypoint(sequence=idx + 1, point=points[idx], status="pending")
        for idx in range(count)
    ]
    for index, wp in enumerate(waypoints, start=1):
        wp.id = index
        wp.estimated_arrival_at = None
        wp.actual_arrival_at = None
        wp.waypoint_type = "collection"
    return waypoints


def test_empty_snapshot_shape():
    payload = _empty_snapshot(date(2026, 8, 13))
    assert payload["operationDate"] == "2026-08-13"
    assert payload["stops"] == []
    assert payload["stopsTotal"] == 0
    assert payload["totalDistanceKm"] is None
    assert payload["dailyPlanClosedAt"] is None
    assert payload["lineCoordinates"] is None


def test_operator_route_snapshot_without_driver_profile():
    db = MagicMock()
    user = SimpleNamespace(role=UserRole.conductor, driver_profile=None)
    payload = operator_route_snapshot(db, user)
    assert payload["stops"] == []
    assert payload["routeId"] is None


def test_operator_route_snapshot_includes_line_coordinates():
    db = MagicMock()
    user = SimpleNamespace(role=UserRole.conductor, driver_profile=SimpleNamespace(id=5))
    plan = SimpleNamespace(
        id=7,
        operation_date=date(2026, 8, 14),
        status="dispatched",
        closed_at=None,
    )
    route = optimized_route(
        21,
        status="in_progress",
        vehicle_code="TR-08",
        waypoints=_make_waypoints(2),
    )
    route.daily_plan = plan
    route.daily_plan_id = 7
    route.estimated_duration_seconds = 3600
    route.total_distance_meters = 28500
    route.vehicle.id = 8

    db.scalar.return_value = plan
    scalars_result = MagicMock()
    scalars_result.unique.return_value.first.return_value = route
    db.scalars.return_value = scalars_result

    geometry = [
        [-62.715, 8.295],
        [-62.712, 8.297],
        [-62.709, 8.299],
        [-62.715, 8.295],
    ]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(
            operator_service,
            "resolve_operational_facilities",
            lambda db: SimpleNamespace(
                landfill=(-62.69, 8.28),
                landfill_unload_minutes=15,
                shift_budget_seconds=12 * 3600,
            ),
        )
        patch.setattr(operator_service, "seed_meta_by_code", lambda: {})
        patch.setattr(operator_service, "fill_level_pct", lambda point: 50)
        patch.setattr(
            operator_service,
            "build_route_linestring_cached",
            lambda route, wps, include_depot=True: geometry,
        )
        payload = operator_route_snapshot(db, user, operation_date=date(2026, 8, 14))

    assert payload["routeId"] == 21
    assert payload["lineCoordinates"] == geometry
    assert len(payload["lineCoordinates"]) >= 2
    assert payload["stops"][0]["stopType"] == "collection"
