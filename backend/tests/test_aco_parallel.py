"""Tests de paralelismo ACO (hormigas)."""

from __future__ import annotations

import pytest

from app.services.aco_parallel import build_ant_solution, resolve_aco_parallel_workers, run_ant_solutions
from app.services.optimization_service import _aco_cvrp


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
    dist, time = _symmetric_matrix(n_customers + 1, base=80.0)
    pheromone = [[1.0 for _ in range(n_customers + 1)] for _ in range(n_customers + 1)]

    routes, cost, duration = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
    )

    assert routes
    assert cost > 0
    assert duration > 0


def test_run_ant_solutions_parallel_matches_sequential_count(monkeypatch):
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = _symmetric_matrix(n_customers + 1, base=80.0)
    pheromone = [[1.0 for _ in range(n_customers + 1)] for _ in range(n_customers + 1)]
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
    )

    assert len(sequential) == len(parallel) == 4
    assert all(cost > 0 for _routes, cost, _dur in parallel)


def test_aco_cvrp_parallel_workers_recorded(monkeypatch):
    monkeypatch.setattr("app.services.optimization_service.settings.aco_parallel_workers", 2)
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = _symmetric_matrix(n_customers + 1, base=100.0)

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
    )

    assert solution.distance_m > 0
    assert solution.aco_parallel_workers == 2
