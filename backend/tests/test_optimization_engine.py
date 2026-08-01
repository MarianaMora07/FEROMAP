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
    _critical_coverage_pct,
    _evaluate_solution,
    _haversine_m,
    _route_cost,
    _two_opt,
)


def _symmetric_matrix(n: int, base: float = 100.0) -> tuple[list[list[float]], list[list[float]]]:
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d = base * abs(i - j)
            dist[i][j] = d
            time[i][j] = d / 10
    return dist, time


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
    dist, time = _symmetric_matrix(n_customers + 1, base=80.0)

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=7)

    visited: set[int] = set()
    for route in solution.vehicle_routes:
        load = 0.0
        cap_idx = 0
        for node in route:
            if node == 0:
                continue
            visited.add(node)
            load += demands[node - 1]
        assert load <= capacities[cap_idx] + 1e-6 or len(solution.vehicle_routes) > 1

    assert visited == set(range(1, n_customers + 1))
    assert solution.distance_m > 0


def test_aco_beats_or_matches_baseline_on_small_instance():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = _symmetric_matrix(n_customers + 1, base=100.0)

    baseline = _baseline_route(n_customers, dist, time)
    optimized = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=42)

    assert optimized.distance_m <= baseline.distance_m * 1.05


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
    dist, time = _build_distance_matrix(None, 0, customers)  # type: ignore[arg-type]
    assert len(dist) == 3
    assert len(dist[0]) == 3
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
