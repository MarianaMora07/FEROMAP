"""Tests de route_playback_service."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import route_geometry_service, route_playback_service
from app.services.route_playback_service import build_daily_route_playback
from tests.resident_fixtures import collection_point, optimized_route, waypoint


def _make_waypoints(count: int = 2):
    points = [
        collection_point(f"CNT-{idx:03d}", lng=-62.712 + idx * 0.003, lat=8.297 + idx * 0.002)
        for idx in range(count)
    ]
    return [waypoint(sequence=idx + 1, point=points[idx]) for idx in range(count)]


def test_build_daily_route_playback_returns_stops_and_geometry():
    db = MagicMock()
    plan = SimpleNamespace(
        id=7,
        operation_date=date(2026, 8, 14),
        status="optimized",
        simulation_id=None,
    )
    route = optimized_route(
        21,
        status="pending",
        vehicle_code="TR-08",
        waypoints=_make_waypoints(2),
    )
    route.route_kind = "optimized"
    route.daily_plan_id = 7
    route.estimated_duration_seconds = 3600
    route.vehicle.id = 8

    db.get.side_effect = lambda model, pk: plan if pk == 7 else None
    db.scalars.return_value.unique.return_value.all.return_value = [route]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(
            route_geometry_service,
            "build_route_linestring_cached",
            lambda route, wps, include_depot=True: [
                [-62.715, 8.295],
                [-62.712, 8.297],
                [-62.709, 8.299],
                [-62.715, 8.295],
            ],
        )
        payload = build_daily_route_playback(db, 7)

    assert payload["dailyPlanId"] == 7
    assert payload["previewMode"] is True
    assert len(payload["routes"]) == 1
    route_payload = payload["routes"][0]
    assert route_payload["routeId"] == 21
    assert route_payload["vehicleLabel"] == "TR-08"
    assert len(route_payload["lineCoordinates"]) >= 2
    assert len(route_payload["stops"]) == 2
    assert route_payload["stops"][0]["code"] == "CNT-000"
    assert route_payload["stops"][0]["serviceMinutes"] == 5
    assert route_payload["totalDurationMinutes"] == 60


def test_build_daily_route_playback_uses_simulation_shortage_for_service_minutes():
    db = MagicMock()
    plan = SimpleNamespace(
        id=8,
        operation_date=date(2026, 8, 14),
        status="dispatched",
        simulation_id=99,
    )
    simulation = SimpleNamespace(
        parameters_json='{"operatorsShortage": 2}',
    )
    route = optimized_route(
        22,
        status="in_progress",
        vehicle_code="TR-04",
        waypoints=_make_waypoints(1),
    )
    route.route_kind = "optimized"
    route.estimated_duration_seconds = 1800
    route.vehicle.id = 4

    def get_model(model, pk):
        if pk == 8:
            return plan
        if pk == 99:
            return simulation
        return None

    db.get.side_effect = get_model
    db.scalars.return_value.unique.return_value.all.return_value = [route]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(
            route_geometry_service,
            "build_route_linestring_cached",
            lambda route, wps, include_depot=True: [
                [-62.715, 8.295],
                [-62.712, 8.297],
                [-62.715, 8.295],
            ],
        )
        payload = build_daily_route_playback(db, 8)

    assert payload["previewMode"] is False
    assert payload["routes"][0]["stops"][0]["serviceMinutes"] == 6


def test_operators_shortage_from_simulation_parses_camel_case():
    simulation = SimpleNamespace(parameters_json='{"operatorsShortage": 1}')
    assert route_playback_service.operators_shortage_from_simulation(simulation) == 1
