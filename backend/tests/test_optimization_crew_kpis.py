"""KPIs de duración con tiempo de servicio por dotación (Fase 8.2)."""

from __future__ import annotations

import pytest

from app.domain.crew_service_time import BASE_SERVICE_SECONDS
from app.services.optimization_service import (
    CustomerNode,
    VehicleUnit,
    _aco_cvrp,
    _baseline_route,
    _compute_kpis,
    _route_operational_duration,
    compute_service_time_sec,
)
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


def _vehicle(assigned: int) -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=1,
        driver_id=1,
        capacity_kg=100.0,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=assigned,
    )


def test_compute_service_time_sec_full_and_reduced_crew():
    full = _vehicle(6)
    reduced = _vehicle(4)
    assert compute_service_time_sec(full) == BASE_SERVICE_SECONDS
    assert compute_service_time_sec(reduced) == BASE_SERVICE_SECONDS + 2 * 30


def test_route_operational_duration_adds_service_per_stop():
    n_customers = 3
    dist, time = vrp_matrix(n_customers, base=50.0)
    route = [0, 1, 2, 3, 0]
    vehicle = _vehicle(6)
    _, travel_s, total_s = _route_operational_duration(
        route, dist, time, vehicle, n_customers=n_customers
    )
    stops = 3
    expected_service = stops * compute_service_time_sec(vehicle)
    assert total_s == int(round(travel_s)) + expected_service


def test_same_aco_distance_different_crew_duration():
    n_customers = 5
    demands = [8.0] * n_customers
    capacities = [80.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    optimized = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=42, **kwargs)
    current = _baseline_route(n_customers, dist, time)
    customers = [
        CustomerNode(i, f"C{i}", 0, 8.0, 50, 0.0, 0.0) for i in range(1, n_customers + 1)
    ]
    served = {c.code for c in customers}

    kpis_full = _compute_kpis(
        current,
        optimized,
        customers,
        served,
        [_vehicle(6)],
        dist,
        time,
    )
    kpis_reduced = _compute_kpis(
        current,
        optimized,
        customers,
        served,
        [_vehicle(4)],
        dist,
        time,
    )

    assert kpis_full["distanceKm"]["optimized"] == pytest.approx(
        kpis_reduced["distanceKm"]["optimized"]
    )
    assert kpis_reduced["durationHours"]["optimized"] > kpis_full["durationHours"]["optimized"]
    assert kpis_reduced["durationBreakdown"]["optimized"]["serviceHours"] > (
        kpis_full["durationBreakdown"]["optimized"]["serviceHours"]
    )
    assert kpis_full["durationBreakdown"]["optimized"]["travelHours"] == pytest.approx(
        kpis_reduced["durationBreakdown"]["optimized"]["travelHours"]
    )


def test_operators_shortage_increases_service_duration():
    n_customers = 4
    dist, time = vrp_matrix(n_customers, base=80.0)
    route = [0, 1, 2, 3, 4, 0]
    vehicle = _vehicle(6)

    _, _, no_shortage = _route_operational_duration(
        route, dist, time, vehicle, operators_shortage=0, n_customers=n_customers
    )
    _, _, with_shortage = _route_operational_duration(
        route, dist, time, vehicle, operators_shortage=2, n_customers=n_customers
    )

    assert with_shortage > no_shortage


def test_exceeds_workday_flag():
    n_customers = 30
    dist, time = vrp_matrix(n_customers, base=800.0)
    current = _baseline_route(n_customers, dist, time)
    optimized = current
    customers = [
        CustomerNode(i, f"C{i}", 0, 5.0, 50, 0.0, 0.0) for i in range(1, n_customers + 1)
    ]

    kpis = _compute_kpis(
        current,
        optimized,
        customers,
        {c.code for c in customers},
        [_vehicle(1)],
        dist,
        time,
        workday_hours=4,
    )

    assert kpis["exceedsWorkday"]["optimized"] is True
    assert kpis["workdayHours"] == 4
