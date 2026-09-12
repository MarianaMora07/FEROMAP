"""Tests del servicio de contingencias (averías en ruta)."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models import DailyPlan, OptimizedRoute, RouteWaypoint, Vehicle
from app.services.contingency_service import (
    _dropped_point_details,
    _resolve_route,
    _resolve_vehicle,
    handle_vehicle_breakdown,
    simulate_daily_contingency,
    simulate_vehicle_breakdown,
)


def _vehicle(code: str = "TR-01", vehicle_id: int = 1, status: str = "in_route") -> Vehicle:
    v = Vehicle(code=code, status=status, max_capacity_kg=1000, fuel_consumption_rate=1.5)
    v.id = vehicle_id
    return v


def _waypoint(point_id: int, status: str = "pending") -> RouteWaypoint:
    wp = RouteWaypoint(collection_point_id=point_id, sequence_order=1, status=status)
    wp.id = point_id
    return wp


def _recalc_with_routes(after_km: float = 10.2) -> dict[str, object]:
    """Payload del motor con la geometría por vehículo del plan alternativo."""
    return {
        "simulationId": 99,
        "kpis": {"distanceKm": {"optimized": after_km}},
        "routesPerVehicle": {
            "optimized": [
                {
                    "type": "Feature",
                    "properties": {
                        "id": "route-optimized",
                        "label": "Ruta optimizada (IA)",
                        "distanceKm": after_km,
                        "durationMin": 40,
                        "stops": [
                            {
                                "sequence": 1,
                                "lng": -62.7,
                                "lat": 8.2,
                                "code": "CNT-001",
                                "stopType": "collection",
                            }
                        ],
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-62.7, 8.2], [-62.71, 8.3]],
                    },
                }
            ]
        },
    }


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


def test_simulate_breakdown_rolls_back_without_dispatching():
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

    recalc_payload = {"simulationId": 99, "kpis": {"distanceKm": {"optimized": 10.2}}}

    with patch(
        "app.services.contingency_service.run_optimization_engine",
        return_value=recalc_payload,
    ) as mock_engine:
        result = simulate_vehicle_breakdown(db, vehicle_id="TR-01", route_id=7)

    # No persiste: revierte la sesión y nunca confirma.
    db.rollback.assert_called_once()
    db.commit.assert_not_called()
    # El recálculo simulado no despacha rutas reales.
    assert mock_engine.call_args.kwargs["auto_dispatch"] is False
    assert result["simulated"] is True
    assert result["pendingPoints"] == 2
    assert result["comparison"]["afterDistanceKm"] == 10.2


def test_simulate_breakdown_returns_alternative_routes_and_resolution():
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

    with patch(
        "app.services.contingency_service.run_optimization_engine",
        return_value=_recalc_with_routes(),
    ) as mock_engine:
        result = simulate_vehicle_breakdown(db, vehicle_id="TR-01", route_id=7)

    # La simulación pide la geometría por vehículo al motor.
    assert mock_engine.call_args.kwargs["include_per_vehicle_routes"] is True
    # Y pide priorizar contenedores críticos (Fase 4 / ADR-003).
    assert mock_engine.call_args.kwargs["priority_fill_level"] is True
    assert result["resolution"] == "reassigned"
    assert result["droppedPoints"] == []
    assert len(result["alternativeRoutes"]) == 1
    assert len(result["alternativeRoutes"][0]["stops"]) >= 1


def test_simulate_breakdown_ignores_landfill_waypoints_without_point():
    db = MagicMock()
    vehicle = _vehicle(vehicle_id=1)
    route = OptimizedRoute(status="in_progress", route_kind="optimized")
    route.id = 7
    landfill = RouteWaypoint(collection_point_id=None, sequence_order=9, status="pending")
    landfill.id = 99
    route.waypoints = [_waypoint(101), landfill]
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

    with patch(
        "app.services.contingency_service.run_optimization_engine",
        return_value=_recalc_with_routes(),
    ) as mock_engine:
        result = simulate_vehicle_breakdown(db, vehicle_id="TR-01", route_id=7)

    # El vertedero no viaja al motor como ``None``; sigue contando como omitido.
    assert mock_engine.call_args.kwargs["collection_point_ids"] == [101]
    assert result["skippedWaypoints"] == 2


def test_simulate_breakdown_without_available_vehicles_marks_points_pending():
    db = MagicMock()
    vehicle = _vehicle(vehicle_id=1)
    route = OptimizedRoute(status="in_progress", route_kind="optimized")
    route.id = 7
    route.waypoints = [_waypoint(101), _waypoint(102)]

    simulation = MagicMock()
    simulation.id = 5
    simulation.parameters_json = None

    db.scalar.side_effect = [vehicle, route]
    latest_result = MagicMock()
    latest_result.first.return_value = simulation
    available_result = MagicMock()
    available_result.all.return_value = []
    db.scalars.side_effect = [latest_result, available_result]

    dropped = [
        {"code": "CNT-002", "fillPct": 95, "criticality": "critico", "priority": 165},
        {"code": "CNT-001", "fillPct": 40, "criticality": "normal", "priority": 120},
    ]
    with (
        patch(
            "app.services.contingency_service._dropped_point_details",
            return_value=dropped,
        ),
        patch("app.services.planning_service.create_pending_visit") as create_visit,
    ):
        result = simulate_vehicle_breakdown(db, vehicle_id="TR-01", route_id=7)

    assert result["resolution"] == "pending"
    assert result["alternativeRoutes"] == []
    # El triage se ordena por criticidad y ``droppedPoints`` deriva de él.
    assert result["droppedPoints"] == ["CNT-002", "CNT-001"]
    assert result["droppedDetails"] == dropped
    assert create_visit.call_count == 2
    # En simulación no se confirma: el wrapper revierte la sesión.
    db.commit.assert_not_called()


def test_dropped_point_details_orders_by_criticality_and_priority():
    from types import SimpleNamespace

    from app.domain.criticality import Criticality, CriticalityLevel

    db = MagicMock()
    low = SimpleNamespace(id=1, code="CNT-LOW")
    high = SimpleNamespace(id=2, code="CNT-HIGH")
    mid = SimpleNamespace(id=3, code="CNT-MID")
    db.scalars.return_value.all.return_value = [low, high, mid]

    criticality_by_code = {
        "CNT-LOW": Criticality(level=CriticalityLevel.NORMAL, fill_pct=40, is_critical=False),
        "CNT-HIGH": Criticality(level=CriticalityLevel.CRITICAL, fill_pct=95, is_critical=True),
        "CNT-MID": Criticality(level=CriticalityLevel.FULL, fill_pct=70, is_critical=False),
    }
    with (
        patch(
            "app.domain.criticality.evaluate_criticality",
            side_effect=lambda point: criticality_by_code[point.code],
        ),
        patch(
            "app.services.planning_service.compute_pending_priority",
            side_effect=lambda *args, **kwargs: 100,
        ),
    ):
        details = _dropped_point_details(db, [1, 2, 3])

    assert [detail["code"] for detail in details] == ["CNT-HIGH", "CNT-MID", "CNT-LOW"]
    assert details[0]["criticality"] == "critico"
    assert details[0]["fillPct"] == 95


def test_simulate_daily_contingency_breakdown_shape():
    db = MagicMock()
    plan = DailyPlan(operation_date=date(2026, 9, 14), status="optimized", scenario_id="normal")
    plan.id = 2
    db.get.return_value = plan

    breakdown = {
        "pendingPoints": 3,
        "skippedWaypoints": 3,
        "simulated": True,
        "comparison": {
            "beforeDistanceKm": 12.5,
            "afterDistanceKm": 10.2,
            "distanceDeltaKm": -2.3,
            "remainingVehicles": 1,
            "reassignedPoints": 3,
        },
        "alternativeRoutes": [{"routeId": 1, "stops": [{"code": "CNT-001"}]}],
        "resolution": "reassigned",
        "droppedPoints": [],
        "droppedDetails": [],
        "message": "Simulación de avería en TR-01: 3 puntos se reasignarían a 1 vehículo(s).",
    }

    with patch(
        "app.services.contingency_service.simulate_vehicle_breakdown",
        return_value=breakdown,
    ):
        result = simulate_daily_contingency(
            db, daily_plan_id=2, contingency_type="breakdown", vehicle_id="TR-01"
        )

    assert result["type"] == "breakdown"
    assert result["simulated"] is True
    assert result["vehicleId"] == "TR-01"
    assert result["afterDistanceKm"] == 10.2
    assert result["distanceDeltaKm"] == -2.3
    assert result["reassignedPoints"] == 3
    assert result["resolution"] == "reassigned"
    assert len(result["alternativeRoutes"]) == 1
    assert result["droppedPoints"] == []
    assert result["droppedDetails"] == []


def test_simulate_daily_contingency_critical_shape():
    db = MagicMock()
    plan = DailyPlan(operation_date=date(2026, 9, 14), status="optimized", scenario_id="normal")
    plan.id = 4
    db.get.return_value = plan

    critical = {
        "remainingPoints": 5,
        "recalculation": {"kpis": {"distanceKm": {"optimized": 9.7}}},
        "alternativeRoutes": [{"routeId": 1, "stops": [{"code": "CNT-001"}]}],
        "resolution": "reassigned",
        "droppedPoints": [],
        "droppedDetails": [],
        "message": "Simulación: 5 punto(s) se reoptimizarían incluyendo CNT-001.",
    }

    with patch(
        "app.services.operational_recalc_service.simulate_critical_container_recalc",
        return_value=critical,
    ):
        result = simulate_daily_contingency(
            db,
            daily_plan_id=4,
            contingency_type="critical_container",
            collection_point_code="CNT-001",
        )

    assert result["type"] == "critical_container"
    assert result["pointCode"] == "CNT-001"
    assert result["afterDistanceKm"] == 9.7
    assert result["reassignedPoints"] == 5
    assert result["resolution"] == "reassigned"
    assert len(result["alternativeRoutes"]) == 1
    assert result["droppedDetails"] == []


def test_critical_container_recalc_prioritizes_fill_level():
    from types import SimpleNamespace

    from app.services import operational_recalc_service

    db = MagicMock()
    point = SimpleNamespace(id=7, code="CNT-001")
    plan = SimpleNamespace(
        id=4,
        operation_date=date(2026, 9, 14),
        weekly_plan_id=None,
        status="optimized",
        closed_at=None,
    )
    db.scalar.return_value = point
    db.get.return_value = plan

    engine_payload = {
        "kpis": {"distanceKm": {"optimized": 9.0}},
        "routesPerVehicle": {"optimized": []},
        "dispatch": {},
    }

    with (
        patch.object(operational_recalc_service, "fill_level_pct", return_value=95),
        patch.object(operational_recalc_service, "collect_remaining_day_point_ids", return_value=[7]),
        patch.object(operational_recalc_service, "get_daily_plan_execution_context", return_value={}),
        patch.object(
            operational_recalc_service, "run_optimization_engine", return_value=engine_payload
        ) as mock_engine,
    ):
        result = operational_recalc_service._run_critical_container_recalc(
            db,
            collection_point_code="CNT-001",
            daily_plan_id=4,
            operation_date=None,
            dry_run=True,
        )

    assert mock_engine.call_args.kwargs["priority_fill_level"] is True
    assert mock_engine.call_args.kwargs["include_per_vehicle_routes"] is True
    assert mock_engine.call_args.kwargs["auto_dispatch"] is False
    assert result["resolution"] == "no_change"
    assert result["droppedDetails"] == []
