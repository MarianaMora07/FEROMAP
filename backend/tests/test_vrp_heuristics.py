"""Tests de heurísticas de referencia (Tarea 6)."""

from __future__ import annotations

import math
import random

from app.domain.vrp_heuristics import clarke_wright_cvrp, genetic_algorithm_cvrp


def _matrix(n_customers: int, seed: int = 5) -> tuple[list[list[float]], list[list[float]]]:
    rng = random.Random(seed)
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
    return dist, time


def _instance(n_customers: int, seed: int = 5) -> tuple[list[float], list[float], list[list[float]], list[list[float]]]:
    rng = random.Random(seed)
    demands = [round(rng.uniform(280, 720), 1) for _ in range(n_customers)]
    total = sum(demands)
    vehicles = 3
    capacity = math.ceil(total / (vehicles * 0.7))
    dist, time = _matrix(n_customers, seed)
    return demands, [float(capacity)] * vehicles, dist, time


def _covered(solution) -> set[int]:
    return {c for route in solution.vehicle_routes for c in route if c != 0}


def test_clarke_wright_covers_all_and_respects_capacity():
    demands, capacities, dist, time = _instance(15)
    solution = clarke_wright_cvrp(15, demands, capacities, dist, time, seed=1)
    assert _covered(solution) == set(range(1, 16))
    assert solution.uncovered == []
    capacity = capacities[0]
    for route in solution.vehicle_routes:
        load = sum(demands[c - 1] for c in route if c != 0)
        assert load <= capacity
    assert solution.distance_m > 0


def test_clarke_wright_is_deterministic():
    demands, capacities, dist, time = _instance(15, seed=7)
    first = clarke_wright_cvrp(15, demands, capacities, dist, time, seed=3)
    second = clarke_wright_cvrp(15, demands, capacities, dist, time, seed=99)
    assert first.distance_m == second.distance_m


def test_genetic_covers_all_and_respects_capacity():
    demands, capacities, dist, time = _instance(20, seed=9)
    solution = genetic_algorithm_cvrp(20, demands, capacities, dist, time, seed=11)
    assert _covered(solution) == set(range(1, 21))
    assert solution.uncovered == []
    capacity = capacities[0]
    for route in solution.vehicle_routes:
        load = sum(demands[c - 1] for c in route if c != 0)
        assert load <= capacity
    assert solution.distance_m > 0


def test_genetic_is_reproducible_with_seed():
    demands, capacities, dist, time = _instance(12, seed=3)
    first = genetic_algorithm_cvrp(12, demands, capacities, dist, time, seed=42, generations=30)
    second = genetic_algorithm_cvrp(12, demands, capacities, dist, time, seed=42, generations=30)
    assert first.distance_m == second.distance_m
