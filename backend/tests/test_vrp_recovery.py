"""Tests del baseline exacto y la recuperación (Fase 7, post-defensa).

Cubren las familias añadidas al benchmark (regret/ALNS), la métrica de estabilidad
del plan y el comportamiento del baseline OR-Tools cuando la dependencia opcional no
está instalada. No tocan el camino ACO por defecto.
"""

from __future__ import annotations

import math
import random

import pytest

from app.config import Settings
from app.domain import ortools_baseline
from app.domain.vrp_heuristics import (
    alns_cvrp,
    plan_stability_pct,
    regret_insertion_cvrp,
)


def _instance(
    n_customers: int, seed: int = 5, vehicles: int = 3
) -> tuple[list[float], list[float], list[list[float]], list[list[float]]]:
    rng = random.Random(seed)
    demands = [round(rng.uniform(280, 720), 1) for _ in range(n_customers)]
    total = sum(demands)
    capacity = math.ceil(total / (vehicles * 0.7))
    size = n_customers + 2
    depot = (2500.0, 2500.0)
    coords = [(rng.uniform(200, 4800), rng.uniform(200, 4800)) for _ in range(n_customers)]
    nodes = [depot] + coords + [depot]
    dist = [[0.0] * size for _ in range(size)]
    time = [[0.0] * size for _ in range(size)]
    for i in range(size):
        for j in range(size):
            if i == j:
                continue
            d = math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]) * 1.3
            dist[i][j] = d
            time[i][j] = d / 6.94
    return demands, [float(capacity)] * vehicles, dist, time


def _covered(solution) -> set[int]:
    return {c for route in solution.vehicle_routes for c in route if c != 0}


# --- Regret insertion --------------------------------------------------------


def test_regret_covers_all_and_respects_capacity():
    demands, capacities, dist, time = _instance(18)
    solution = regret_insertion_cvrp(18, demands, capacities, dist, time, seed=1)

    assert _covered(solution) == set(range(1, 19))
    assert solution.uncovered == []
    assert solution.label == "regret"
    for route in solution.vehicle_routes:
        load = sum(demands[c - 1] for c in route if c != 0)
        assert load <= capacities[0]
    assert solution.distance_m > 0


def test_regret_is_deterministic():
    demands, capacities, dist, time = _instance(15, seed=7)
    first = regret_insertion_cvrp(15, demands, capacities, dist, time, seed=3)
    second = regret_insertion_cvrp(15, demands, capacities, dist, time, seed=99)
    assert first.distance_m == second.distance_m
    assert first.vehicle_routes == second.vehicle_routes


def test_regret_handles_empty_instance():
    solution = regret_insertion_cvrp(0, [], [], [[]], [[]])
    assert solution.vehicle_routes == []
    assert solution.uncovered == []


# --- ALNS --------------------------------------------------------------------


def test_alns_never_worse_than_regret():
    demands, capacities, dist, time = _instance(20, seed=11)
    base = regret_insertion_cvrp(20, demands, capacities, dist, time, seed=4)
    improved = alns_cvrp(20, demands, capacities, dist, time, seed=4, iterations=30)

    assert improved.label == "alns"
    assert improved.distance_m <= base.distance_m
    assert _covered(improved) == set(range(1, 21))
    for route in improved.vehicle_routes:
        load = sum(demands[c - 1] for c in route if c != 0)
        assert load <= capacities[0]


def test_alns_is_reproducible_with_seed():
    demands, capacities, dist, time = _instance(16, seed=3)
    first = alns_cvrp(16, demands, capacities, dist, time, seed=42, iterations=25)
    second = alns_cvrp(16, demands, capacities, dist, time, seed=42, iterations=25)
    assert first.distance_m == second.distance_m
    assert first.vehicle_routes == second.vehicle_routes


# --- Estabilidad del plan ----------------------------------------------------


def test_plan_stability_identical_is_full():
    routes = [[0, 1, 2, 3, 0], [0, 4, 5, 0]]
    assert plan_stability_pct(routes, routes) == 100.0


def test_plan_stability_disjoint_is_zero():
    first = [[0, 1, 2, 0]]
    second = [[0, 2, 1, 0]]
    # Mismos clientes pero arcos invertidos → sin arcos compartidos.
    assert plan_stability_pct(first, second) == 0.0


def test_plan_stability_is_symmetric():
    first = [[0, 1, 2, 3, 0], [0, 4, 5, 0]]
    second = [[0, 1, 3, 2, 0], [0, 5, 4, 0]]
    assert plan_stability_pct(first, second) == plan_stability_pct(second, first)


def test_plan_stability_empty_is_full():
    assert plan_stability_pct([], []) == 100.0
    assert plan_stability_pct([[0, 0]], [[0, 0]]) == 100.0


# --- Baseline OR-Tools (dependencia opcional) --------------------------------


def test_ortools_available_is_bool():
    assert isinstance(ortools_baseline.available(), bool)


def test_ortools_unavailable_raises_explicit_error():
    if ortools_baseline.available():
        pytest.skip("ortools está instalado: el baseline es ejecutable")
    demands, capacities, dist, time = _instance(3)
    with pytest.raises(ortools_baseline.OrtoolsUnavailableError):
        ortools_baseline.solve_cvrp_ortools(3, demands, capacities, dist, time)


# --- Flags de configuración (no cambian el camino ACO) -----------------------


def test_solver_defaults_keep_aco_path(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("SOLVER_BACKEND", raising=False)
    monkeypatch.delenv("CONTINGENCY_STRATEGY", raising=False)

    local = Settings(_env_file=None)
    assert local.solver_backend == "aco"
    assert local.contingency_strategy == "aco_resolve"


def test_invalid_solver_values_normalize_to_defaults(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("SOLVER_BACKEND", "banana")
    monkeypatch.setenv("CONTINGENCY_STRATEGY", "nope")

    local = Settings(_env_file=None)
    assert local.solver_backend == "aco"
    assert local.contingency_strategy == "aco_resolve"


def test_valid_solver_values_are_preserved(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("SOLVER_BACKEND", "ORTOOLS")
    monkeypatch.setenv("CONTINGENCY_STRATEGY", "ALNS")

    local = Settings(_env_file=None)
    assert local.solver_backend == "ortools"
    assert local.contingency_strategy == "alns"
