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

AntSolution = tuple[list[list[int]], float, float, list[int]]


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


def _two_opt(route: list[int], dist_matrix: list[list[float]], *, landfill_idx: int) -> list[int]:
    if landfill_idx in route[1:-1]:
        return route
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


def _pick_candidate(
    rng: random.Random,
    current: int,
    candidates: list[int],
    pheromone: list[list[float]],
    dist_matrix: list[list[float]],
    *,
    alpha: float,
    beta: float,
) -> int:
    weights = []
    for c in candidates:
        tau = pheromone[current][c] ** alpha
        eta = (1.0 / max(dist_matrix[current][c], 1.0)) ** beta
        weights.append(tau * eta)
    total = sum(weights)
    if total <= 0:
        return rng.choice(candidates)
    r = rng.random() * total
    acc = 0.0
    chosen = candidates[-1]
    for c, weight in zip(candidates, weights):
        acc += weight
        if acc >= r:
            chosen = c
            break
    return chosen


def _can_visit_landfill(
    elapsed: float,
    current: int,
    landfill_idx: int,
    time_matrix: list[list[float]],
    unload_sec: float,
    shift_budget_sec: float | None,
) -> bool:
    travel = time_matrix[current][landfill_idx]
    if shift_budget_sec is None:
        return True
    return elapsed + travel + unload_sec <= shift_budget_sec


def _close_route(
    route: list[int],
    *,
    current: int,
    load: float,
    elapsed: float,
    landfill_idx: int,
    time_matrix: list[list[float]],
    unload_sec: float,
    shift_budget_sec: float | None,
) -> tuple[list[int], int, float]:
    if load > 0 and _can_visit_landfill(
        elapsed, current, landfill_idx, time_matrix, unload_sec, shift_budget_sec
    ):
        route.append(landfill_idx)
        elapsed += time_matrix[current][landfill_idx] + unload_sec
        current = landfill_idx
        load = 0.0

    travel_depot = time_matrix[current][0]
    if shift_budget_sec is None or elapsed + travel_depot <= shift_budget_sec:
        route.append(0)
    elif route[-1] != 0:
        route.append(0)

    return route, current, elapsed


def build_ant_solution(
    ant_seed: int,
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
    *,
    landfill_idx: int | None = None,
    shift_budget_sec: float | None = None,
    unload_sec: float = 0.0,
    service_secs: list[float] | None = None,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
) -> AntSolution:
    rng = random.Random(ant_seed)
    n_vehicles = len(capacities)
    landfill = landfill_idx if landfill_idx is not None else n_customers + 1
    service_per_vehicle = service_secs or [0.0] * n_vehicles
    customer_indices = list(range(1, n_customers + 1))
    unvisited = set(customer_indices)
    routes: list[list[int]] = []

    for v_idx in range(n_vehicles):
        route = [0]
        load = 0.0
        current = 0
        elapsed = 0.0
        cap = capacities[v_idx]
        service_sec = service_per_vehicle[min(v_idx, len(service_per_vehicle) - 1)]

        while unvisited:
            candidates = [c for c in unvisited if load + demands[c - 1] <= cap]

            if not candidates and load > 0:
                if _can_visit_landfill(
                    elapsed, current, landfill, time_matrix, unload_sec, shift_budget_sec
                ):
                    route.append(landfill)
                    elapsed += time_matrix[current][landfill] + unload_sec
                    load = 0.0
                    current = landfill
                    continue
                break

            if not candidates:
                break

            affordable = candidates
            if shift_budget_sec is not None:
                affordable = [
                    c
                    for c in candidates
                    if elapsed + time_matrix[current][c] + service_sec <= shift_budget_sec
                ]
            if not affordable:
                break

            chosen = _pick_candidate(
                rng,
                current,
                affordable,
                pheromone,
                dist_matrix,
                alpha=alpha,
                beta=beta,
            )
            travel = time_matrix[current][chosen]
            route.append(chosen)
            elapsed += travel + service_sec
            load += demands[chosen - 1]
            unvisited.remove(chosen)
            current = chosen

        route, _, _ = _close_route(
            route,
            current=current,
            load=load,
            elapsed=elapsed,
            landfill_idx=landfill,
            time_matrix=time_matrix,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
        )
        if len(route) > 2:
            routes.append(_two_opt(route, dist_matrix, landfill_idx=landfill))

    served: set[int] = set()
    for route in routes:
        for idx in route:
            if 1 <= idx <= n_customers:
                served.add(idx)
    uncovered = [c for c in customer_indices if c not in served]

    cost, duration = _evaluate_solution(routes, dist_matrix, time_matrix)
    return routes, cost, duration, uncovered


def _ant_task_payload(
    ant_seed: int,
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
    landfill_idx: int,
    shift_budget_sec: float | None,
    unload_sec: float,
    service_secs: list[float],
) -> AntSolution:
    return build_ant_solution(
        ant_seed,
        n_customers,
        demands,
        capacities,
        dist_matrix,
        time_matrix,
        pheromone,
        landfill_idx=landfill_idx,
        shift_budget_sec=shift_budget_sec,
        unload_sec=unload_sec,
        service_secs=service_secs,
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
    landfill_idx: int,
    shift_budget_sec: float | None = None,
    unload_sec: float = 0.0,
    service_secs: list[float] | None = None,
) -> list[AntSolution]:
    from concurrent.futures import ProcessPoolExecutor

    service_secs = service_secs or [0.0] * len(capacities)

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
                landfill_idx=landfill_idx,
                shift_budget_sec=shift_budget_sec,
                unload_sec=unload_sec,
                service_secs=service_secs,
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
                landfill_idx,
                shift_budget_sec,
                unload_sec,
                service_secs,
            )
            for seed in ant_seeds
        ]
        return [future.result() for future in futures]
    finally:
        if owns_pool:
            pool.shutdown(wait=True)
