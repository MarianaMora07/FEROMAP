"""Construcción paralela de soluciones por hormiga (ACO) en procesos worker."""

from __future__ import annotations

import os
import random
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from concurrent.futures import ProcessPoolExecutor

ACO_ALPHA = 1.0
ACO_BETA = 3.0

AntSolution = tuple[list[list[int]], float, float]


def resolve_aco_parallel_workers(aco_ants: int) -> int:
    """0 = auto; 1 = secuencial; N>1 = workers explícitos."""
    configured = settings.aco_parallel_workers
    if configured == 1:
        return 1
    if configured > 1:
        return max(1, min(configured, aco_ants))
    cpus = os.cpu_count() or 2
    return max(1, min(aco_ants, max(cpus - 1, 1)))


def _route_cost(
    route: list[int],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> tuple[float, float]:
    if len(route) < 2:
        return 0.0, 0.0
    distance = 0.0
    duration = 0.0
    for i, j in zip(route[:-1], route[1:]):
        distance += dist_matrix[i][j]
        duration += time_matrix[i][j]
    return distance, duration


def _two_opt(route: list[int], dist_matrix: list[list[float]]) -> list[int]:
    if len(route) <= 3:
        return route
    best = route[:]
    improved = True
    while improved:
        improved = False
        for i in range(1, len(best) - 2):
            for j in range(i + 1, len(best) - 1):
                a, b = best[i - 1], best[i]
                c, d = best[j], best[j + 1]
                old_cost = dist_matrix[a][b] + dist_matrix[c][d]
                new_cost = dist_matrix[a][c] + dist_matrix[b][d]
                if new_cost < old_cost - 1e-6:
                    best[i : j + 1] = reversed(best[i : j + 1])
                    improved = True
    return best


def _evaluate_solution(
    vehicle_routes: list[list[int]],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> tuple[float, float]:
    total_d = 0.0
    total_t = 0.0
    for route in vehicle_routes:
        d, t = _route_cost(route, dist_matrix, time_matrix)
        total_d += d
        total_t += t
    return total_d, total_t


def build_ant_solution(
    ant_seed: int,
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
    *,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
) -> AntSolution:
    rng = random.Random(ant_seed)
    n_vehicles = len(capacities)
    customer_indices = list(range(1, n_customers + 1))
    unvisited = set(customer_indices)
    routes: list[list[int]] = []

    for v_idx in range(n_vehicles):
        route = [0]
        load = 0.0
        current = 0
        while unvisited:
            candidates = [c for c in unvisited if load + demands[c - 1] <= capacities[v_idx]]
            if not candidates:
                break
            weights = []
            for c in candidates:
                tau = pheromone[current][c] ** alpha
                eta = (1.0 / max(dist_matrix[current][c], 1.0)) ** beta
                weights.append(tau * eta)
            total = sum(weights)
            if total <= 0:
                chosen = rng.choice(candidates)
            else:
                r = rng.random() * total
                acc = 0.0
                chosen = candidates[-1]
                for c, weight in zip(candidates, weights):
                    acc += weight
                    if acc >= r:
                        chosen = c
                        break
            route.append(chosen)
            load += demands[chosen - 1]
            unvisited.remove(chosen)
            current = chosen
        route.append(0)
        if len(route) > 2:
            routes.append(_two_opt(route, dist_matrix))

    if unvisited:
        remaining = sorted(unvisited, key=lambda c: demands[c - 1], reverse=True)
        for customer in remaining:
            placed = False
            for r_idx, route in enumerate(routes):
                v_cap = capacities[min(r_idx, n_vehicles - 1)]
                route_load = sum(demands[node - 1] for node in route if node != 0)
                if route_load + demands[customer - 1] <= v_cap:
                    route.insert(-1, customer)
                    routes[r_idx] = _two_opt(route, dist_matrix)
                    placed = True
                    break
            if not placed and routes:
                routes[-1].insert(-1, customer)
                routes[-1] = _two_opt(routes[-1], dist_matrix)

    cost, duration = _evaluate_solution(routes, dist_matrix, time_matrix)
    return routes, cost, duration


def _ant_task_payload(
    ant_seed: int,
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
) -> AntSolution:
    return build_ant_solution(
        ant_seed,
        n_customers,
        demands,
        capacities,
        dist_matrix,
        time_matrix,
        pheromone,
    )


def run_ant_solutions(
    *,
    ant_seeds: list[int],
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
    max_workers: int,
    executor: ProcessPoolExecutor | None = None,
) -> list[AntSolution]:
    from concurrent.futures import ProcessPoolExecutor

    if max_workers <= 1 or len(ant_seeds) <= 1:
        return [
            build_ant_solution(
                seed,
                n_customers,
                demands,
                capacities,
                dist_matrix,
                time_matrix,
                pheromone,
            )
            for seed in ant_seeds
        ]

    owns_pool = executor is None
    pool = executor or ProcessPoolExecutor(max_workers=max_workers)
    try:
        futures = [
            pool.submit(
                _ant_task_payload,
                seed,
                n_customers,
                demands,
                capacities,
                dist_matrix,
                time_matrix,
                pheromone,
            )
            for seed in ant_seeds
        ]
        return [future.result() for future in futures]
    finally:
        if owns_pool:
            pool.shutdown(wait=True)

