"""Tests de paralelismo ACO (hormigas)."""

from __future__ import annotations

import pytest

from app.services.aco_parallel import build_ant_solution, resolve_aco_parallel_workers, run_ant_solutions
from app.services.optimization_service import _aco_cvrp
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


@pytest.fixture(autouse=True)
def sequential_ants_in_tests(monkeypatch):
    monkeypatch.setattr("app.services.optimization_service.settings.aco_parallel_workers", 1)


def test_resolve_aco_parallel_workers_auto_and_explicit(monkeypatch):
    monkeypatch.setattr("app.services.aco_parallel.settings.aco_parallel_workers", 0)
    assert resolve_aco_parallel_workers(12) >= 1

    monkeypatch.setattr("app.services.aco_parallel.settings.aco_parallel_workers", 1)
    assert resolve_aco_parallel_workers(12) == 1

    monkeypatch.setattr("app.services.aco_parallel.settings.aco_parallel_workers", 4)
    assert resolve_aco_parallel_workers(12) == 4
    assert resolve_aco_parallel_workers(2) == 2


def test_build_ant_solution_returns_feasible_routes():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    routes, cost, duration, uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        **kwargs,
    )

    assert routes
    assert cost > 0
    assert duration > 0
    assert uncovered == []


def test_run_ant_solutions_parallel_matches_sequential_count(monkeypatch):
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]
    seeds = [1, 2, 3, 4]

    sequential = run_ant_solutions(
        ant_seeds=seeds,
        n_customers=n_customers,
        demands=demands,
        capacities=capacities,
        dist_matrix=dist,
        time_matrix=time,
        pheromone=pheromone,
        max_workers=1,
        **kwargs,
    )

    parallel = run_ant_solutions(
        ant_seeds=seeds,
        n_customers=n_customers,
        demands=demands,
        capacities=capacities,
        dist_matrix=dist,
        time_matrix=time,
        pheromone=pheromone,
        max_workers=2,
        **kwargs,
    )

    assert len(sequential) == len(parallel) == 4
    assert all(cost > 0 for _routes, cost, _dur, _unc in parallel)


def test_aco_cvrp_parallel_workers_recorded(monkeypatch):
    monkeypatch.setattr("app.services.optimization_service.settings.aco_parallel_workers", 2)
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
        aco_iterations=3,
        aco_patience=0,
        seed=7,
        **kwargs,
    )

    assert solution.distance_m > 0
    assert solution.aco_parallel_workers == 2


def test_overflow_penalty_increases_cost():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=1200.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    def _run(**overflow_kwargs):
        return build_ant_solution(
            42,
            n_customers,
            demands,
            capacities,
            dist,
            time,
            pheromone,
            **kwargs,
            **overflow_kwargs,
        )

    _routes, base_cost, _dur, _unc = _run()
    _routes2, penalized_cost, _dur2, _unc2 = _run(
        overflow_deadline_sec=[0.0] * n_customers,
        overflow_rate_kg_per_hour=[100.0] * n_customers,
        overflow_weight=1.0,
    )

    assert penalized_cost > base_cost


def test_aco_cvrp_overflow_does_not_inflate_reported_distance():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=900.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    plain = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=11, **kwargs)
    penalized = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        seed=11,
        overflow_deadline_sec=[0.0] * n_customers,
        overflow_rate_kg_per_hour=[100.0] * n_customers,
        overflow_weight=500.0,
        **kwargs,
    )

    # La distancia reportada es pura (sin penalización), aunque la búsqueda cambie:
    # con peso 500 la penalización sería del orden de cientos de miles de metros.
    assert penalized.distance_m > 0
    assert plain.distance_m < 100_000
    assert penalized.distance_m < 100_000


def test_aco_cvrp_accepts_custom_hyperparameters():
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
        seed=3,
        alpha=1.5,
        beta=2.0,
        rho=0.2,
        two_opt_passes=3,
        at_risk_multiplier=2.0,
        critical_multiplier=1.5,
        high_multiplier=1.2,
        **kwargs,
    )

    assert solution.distance_m > 0
    assert solution.uncovered_customer_indices == []


def test_build_ant_solution_accepts_multiplier_and_opt_overrides():
    n_customers = 3
    demands = [4.0, 4.0, 4.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=90.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    routes, cost, _duration, uncovered = build_ant_solution(
        7,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        alpha=2.0,
        beta=1.0,
        two_opt_passes=2,
        at_risk_multiplier=1.8,
        critical_multiplier=1.4,
        high_multiplier=1.15,
        **kwargs,
    )

    assert routes
    assert cost > 0
    assert uncovered == []


def test_aco_cvrp_accepts_pheromone_q_and_elitist():
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
        seed=5,
        pheromone_q=2.0,
        pheromone_elitist=True,
        **kwargs,
    )

    assert solution.distance_m > 0
    assert solution.uncovered_customer_indices == []
