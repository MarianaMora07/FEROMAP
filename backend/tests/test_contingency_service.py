"""Tests del servicio de contingencias (averías en ruta)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models import OptimizedRoute, RouteWaypoint, Vehicle
from app.services.contingency_service import _resolve_route, _resolve_vehicle, handle_vehicle_breakdown


def _vehicle(code: str = "TR-01", vehicle_id: int = 1, status: str = "in_route") -> Vehicle:
    v = Vehicle(code=code, status=status, max_capacity_kg=1000, fuel_consumption_rate=1.5)
    v.id = vehicle_id
    return v


def _waypoint(point_id: int, status: str = "pending") -> RouteWaypoint:
    wp = RouteWaypoint(collection_point_id=point_id, sequence_order=1, status=status)
    wp.id = point_id
    return wp


def test_resolve_vehicle_by_code():
    db = MagicMock()
    vehicle = _vehicle()
    db.scalar.return_value = vehicle
    result = _resolve_vehicle(db, "TR-01")
    assert result is vehicle


def test_resolve_vehicle_by_numeric_id():
    db = MagicMock()
    vehicle = _vehicle(vehicle_id=5)
    db.get.return_value = vehicle
    result = _resolve_vehicle(db, "5")
    assert result.id == 5


def test_resolve_vehicle_not_found():
    db = MagicMock()
    db.get.return_value = None
    db.scalar.return_value = None
    with pytest.raises(HTTPException) as exc:
        _resolve_vehicle(db, "UNKNOWN")
    assert exc.value.status_code == 404


def test_resolve_route_by_id():
    db = MagicMock()
    route = OptimizedRoute(status="in_progress", route_kind="optimized")
    route.id = 10
    route.waypoints = []
    db.scalar.return_value = route
    vehicle = _vehicle(vehicle_id=2)
    result = _resolve_route(db, vehicle, 10)
    assert result is route


def test_handle_breakdown_rejects_vehicle_already_in_maintenance():
    db = MagicMock()
    vehicle = _vehicle(status="maintenance")
    db.get.return_value = vehicle

    with pytest.raises(HTTPException) as exc:
        handle_vehicle_breakdown(db, vehicle_id="1")
    assert exc.value.status_code == 400


def test_handle_breakdown_no_pending_points():
    db = MagicMock()
    vehicle = _vehicle()
    route = OptimizedRoute(status="in_progress", route_kind="optimized")
    route.id = 3
    route.waypoints = [_waypoint(1, status="completed")]

    db.scalar.side_effect = [vehicle, route]

    latest_result = MagicMock()
    latest_result.first.return_value = None
    db.scalars.return_value = latest_result

    result = handle_vehicle_breakdown(db, vehicle_id="TR-01", route_id=3)

    assert result["pendingPoints"] == 0
    assert result["recalculation"] is None
    assert "No había paradas pendientes" in result["message"]
    db.commit.assert_called_once()


def test_handle_breakdown_triggers_reoptimization():
    db = MagicMock()
    vehicle = _vehicle(vehicle_id=1)
    route = OptimizedRoute(status="in_progress", route_kind="optimized")
    route.id = 7
    route.waypoints = [_waypoint(101), _waypoint(102)]
    backup = _vehicle(code="TR-02", vehicle_id=2, status="available")

    simulation = MagicMock()
    simulation.id = 5
    simulation.kpi_total_distance_optimized = 12.5
    simulation.parameters_json = None

    db.scalar.side_effect = [vehicle, route]

    latest_result = MagicMock()
    latest_result.first.return_value = simulation
    available_result = MagicMock()
    available_result.all.return_value = [backup]
    db.scalars.side_effect = [latest_result, available_result]

    recalc_payload = {
        "simulationId": 99,
        "kpis": {"distanceKm": {"optimized": 10.2}},
    }

    with patch(
        "app.services.contingency_service.run_optimization_engine",
        return_value=recalc_payload,
    ) as mock_engine:
        result = handle_vehicle_breakdown(db, vehicle_id="TR-01", route_id=7, description="Motor")

    assert result["pendingPoints"] == 2
    assert result["skippedWaypoints"] == 2
    assert result["recalculation"]["simulationId"] == 99
    assert result["comparison"]["reassignedPoints"] == 2
    mock_engine.assert_called_once()
    call_kwargs = mock_engine.call_args.kwargs
    assert call_kwargs["collection_point_ids"] == [101, 102]
    assert call_kwargs["exclude_vehicle_ids"] == [1]
    assert call_kwargs["contingency_meta"]["brokenVehicleCode"] == "TR-01"
    db.commit.assert_called()
