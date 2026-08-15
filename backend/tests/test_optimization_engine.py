"""Tests unitarios del motor ACO/VRP (sin base de datos)."""

from __future__ import annotations

import math

import pytest

from app.services.optimization_service import (
    CustomerNode,
    RouteSolution,
    _aco_cvrp,
    _baseline_route,
    _build_distance_matrix,
    _build_engine_metrics,
    _critical_coverage_pct,
    _evaluate_solution,
    _format_computation_log_message,
    _haversine_m,
    _landfill_idx,
    _route_cost,
    _two_opt,
)
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


def _symmetric_matrix(n: int, base: float = 100.0) -> tuple[list[list[float]], list[list[float]]]:
    """Compat: matrices antiguas N+1; preferir vrp_matrix para multi-viaje."""
    if n >= 3:
        return vrp_matrix(n - 2, base=base)
    return vrp_matrix(max(1, n - 1), base=base)


def test_haversine_m_same_point_is_zero():
    assert _haversine_m(-62.715, 8.295, -62.715, 8.295) == 0.0


def test_haversine_m_positive_distance():
    d = _haversine_m(-62.715, 8.295, -62.720, 8.300)
    assert d > 0
    assert d < 2000


def test_route_cost_empty_route():
    dist, time = _symmetric_matrix(3)
    assert _route_cost([], dist, time) == (0.0, 0.0)


def test_route_cost_sums_segments():
    dist, time = _symmetric_matrix(4, base=50.0)
    route = [0, 1, 2, 3]
    d, t = _route_cost(route, dist, time)
    assert d == pytest.approx(150.0)
    assert t == pytest.approx(15.0)


def test_two_opt_improves_or_maintains_cost():
    dist, time = _symmetric_matrix(5, base=10.0)
    route = [0, 1, 4, 2, 3, 0]
    before = _route_cost(route, dist, time)[0]
    improved = _two_opt(route, dist)
    after = _route_cost(improved, dist, time)[0]
    assert after <= before + 1e-6


def test_baseline_route_visits_all_customers():
    n_customers = 5
    dist, time = _symmetric_matrix(n_customers + 1)
    solution = _baseline_route(n_customers, dist, time)
    assert len(solution.vehicle_routes) == 1
    route = solution.vehicle_routes[0]
    assert route[0] == 0
    assert route[-1] == 0
    assert sorted(route[1:-1]) == list(range(1, n_customers + 1))


def test_aco_cvrp_respects_capacity_and_covers_customers():
    n_customers = 6
    demands = [10.0, 15.0, 8.0, 12.0, 20.0, 5.0]
    capacities = [40.0, 40.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, len(capacities))
    landfill_idx = kwargs["landfill_idx"]

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=7, **kwargs)

    visited: set[int] = set()
    for route in solution.vehicle_routes:
        load = 0.0
        cap = capacities[0]
        for node in route:
            if node in (0, landfill_idx):
                load = 0.0
                continue
            visited.add(node)
            load += demands[node - 1]
            assert load <= cap + 1e-6

    assert visited == set(range(1, n_customers + 1))
    assert solution.distance_m > 0


def test_aco_finds_feasible_solution_on_small_instance():
    n_customers = 4
    demands = [4.0, 4.0, 4.0, 4.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    optimized = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=42, **kwargs)

    assert optimized.distance_m > 0
    assert optimized.uncovered_customer_indices == []
    assert any(1 <= idx <= n_customers for route in optimized.vehicle_routes for idx in route)


def test_evaluate_solution_sums_routes():
    dist, time = _symmetric_matrix(4)
    routes = [[0, 1, 0], [0, 2, 3, 0]]
    total_d, total_t = _evaluate_solution(routes, dist, time)
    d1, t1 = _route_cost(routes[0], dist, time)
    d2, t2 = _route_cost(routes[1], dist, time)
    assert total_d == pytest.approx(d1 + d2)
    assert total_t == pytest.approx(t1 + t2)


def test_build_distance_matrix_shape():
    customers = [
        CustomerNode(1, "C1", 0, 10.0, 50, -62.71, 8.29),
        CustomerNode(2, "C2", 0, 12.0, 60, -62.72, 8.30),
    ]
    dist, time = _build_distance_matrix(
        None,
        0,
        customers,
        depot_lon=-62.715,
        depot_lat=8.295,
        landfill_node=0,
        landfill_lon=-62.690,
        landfill_lat=8.280,
    )
    assert len(dist) == 4
    assert len(dist[0]) == 4
    assert dist[0][0] == 0.0
    assert dist[1][2] > 0


def test_critical_coverage_pct():
    customers = [
        CustomerNode(1, "A", 0, 1.0, 90, 0, 0),
        CustomerNode(2, "B", 0, 1.0, 50, 0, 0),
        CustomerNode(3, "C", 0, 1.0, 85, 0, 0),
    ]
    assert _critical_coverage_pct(customers, {"A", "C"}) == 100
    assert _critical_coverage_pct(customers, {"A"}) == 50
    assert _critical_coverage_pct(customers, set()) == 0


def test_route_solution_dataclass_defaults():
    sol = RouteSolution()
    assert sol.vehicle_routes == []
    assert sol.distance_m == 0.0


def test_build_engine_metrics_rounds_and_overhead():
    metrics = _build_engine_metrics(
        computation_seconds=10.456,
        aco_seconds=3.2,
        graph_seconds=5.1,
        customer_count=18,
        vehicle_count=3,
        aco_ants=8,
        aco_iterations=15,
        aco_iterations_run=9,
        aco_stopped_early=True,
        aco_patience=5,
        matrix_cache_hit=True,
        matrix_cache_incremental=False,
        matrix_patched_cells=0,
        matrix_parent_point_count=0,
        graph_load_source="disk",
        aco_parallel_workers=2,
        aco_convergence=[
            {"iteration": 1, "bestDistanceKm": 10.0, "iterationBestDistanceKm": 10.5},
        ],
    )
    assert metrics["computationSeconds"] == 10.46
    assert metrics["acoSeconds"] == 3.2
    assert metrics["graphLoadSeconds"] == 5.1
    assert metrics["overheadSeconds"] == pytest.approx(2.16, abs=0.01)
    assert metrics["customers"] == 18
    assert metrics["vehicles"] == 3
    assert metrics["acoAnts"] == 8
    assert metrics["acoIterations"] == 15
    assert metrics["acoIterationsRun"] == 9
    assert metrics["acoStoppedEarly"] is True
    assert metrics["acoPatience"] == 5
    assert metrics["matrixCacheHit"] is True
    assert metrics["graphLoadSource"] == "disk"
    assert metrics["acoParallelWorkers"] == 2
    assert len(metrics["acoConvergence"]) == 1
    assert metrics["acoConvergence"][0]["iteration"] == 1


def test_aco_cvrp_records_convergence_curve():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=4,
        aco_iterations=6,
        aco_patience=0,
        seed=3,
        **kwargs,
    )

    assert len(solution.aco_convergence) == 6
    assert solution.aco_convergence[0]["iteration"] == 1
    assert solution.aco_convergence[-1]["iteration"] == 6
    assert solution.aco_convergence[-1]["bestDistanceKm"] <= solution.aco_convergence[0]["bestDistanceKm"]


def test_format_computation_log_message():
    msg = _format_computation_log_message(
        {
            "computationSeconds": 8.4,
            "acoSeconds": 2.1,
            "acoAnts": 12,
            "acoIterations": 20,
        }
    )
    assert "8.4 s" in msg
    assert "ACO: 2.1 s" in msg
    assert "12×20" in msg


def test_normalize_aco_parameters_use_defaults_and_clamp():
    from app.services.scenario_parameters import normalize_aco_ants, normalize_aco_iterations

    assert normalize_aco_ants(None) >= 4
    assert normalize_aco_iterations(None) >= 5
    assert normalize_aco_ants(2) == 4
    assert normalize_aco_ants(99) == 30
    assert normalize_aco_iterations(3) == 5
    assert normalize_aco_iterations(80) == 60


def test_aco_early_stops_when_no_improvement(monkeypatch):
    monkeypatch.setattr("app.services.optimization_service.ACO_PATIENCE", 2)
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=4,
        aco_iterations=30,
        aco_patience=2,
        seed=1,
        **kwargs,
    )

    assert solution.aco_iterations_run < 30
    assert solution.aco_stopped_early is True
    assert solution.distance_m > 0
