"""Heurísticas de referencia para el benchmark entre familias (Tarea 6).

Clarke-Wright (ahorros, determinista) y Algoritmo Genético básico. Ambas resuelven
el CVRP multi-vehículo con capacidades homogéneas y objetivo distancia, usando la
misma convención de índices que el motor ACO (0 = depósito, 1..N = clientes).

Nota de equidad: los escenarios de benchmark usan capacidades holgadas para que el
vertedero/recarga no sea necesario; así las tres familias compiten sobre el mismo
problema (rutas cerradas en depósito por capacidad).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

# Penalización por cliente sin cubrir en el fitness del GA (m muy superior a km).
UNCOVERED_PENALTY_KM = 1_000_000.0


@dataclass
class HeuristicSolution:
    label: str
    vehicle_routes: list[list[int]] = field(default_factory=list)
    distance_m: float = 0.0
    duration_s: float = 0.0
    uncovered: list[int] = field(default_factory=list)

    def summary(self) -> dict:
        return {
            "distanceM": round(self.distance_m, 1),
            "durationS": round(self.duration_s, 1),
            "uncoveredCount": len(self.uncovered),
        }


def _demand(customer: int, demands: list[float]) -> float:
    return demands[customer - 1]


def _route_cost_indices(route: list[int], dist: list[list[float]], time: list[list[float]]) -> tuple[float, float]:
    if len(route) < 2:
        return 0.0, 0.0
    return (
        sum(dist[route[k]][route[k + 1]] for k in range(len(route) - 1)),
        sum(time[route[k]][route[k + 1]] for k in range(len(route) - 1)),
    )


def _wrap_routes(routes: list[list[int]], dist: list[list[float]], time: list[list[float]]) -> HeuristicSolution:
    wrapped: list[list[int]] = []
    distance_m = 0.0
    duration_s = 0.0
    for route in routes:
        full = [0] + route + [0]
        wrapped.append(full)
        d, t = _route_cost_indices(full, dist, time)
        distance_m += d
        duration_s += t
    return HeuristicSolution(label="", vehicle_routes=wrapped, distance_m=distance_m, duration_s=duration_s)


# --- Clarke-Wright (ahorros) -------------------------------------------------


def clarke_wright_cvrp(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist: list[list[float]],
    time: list[list[float]],
    *,
    seed: int = 1,
) -> HeuristicSolution:
    """Algoritmo de ahorros clásico (determinista; seed se ignora por compatibilidad)."""
    if n_customers <= 0:
        return HeuristicSolution(label="clarke_wright")
    if not capacities:
        return HeuristicSolution(label="clarke_wright")
    capacity = max(1.0, float(capacities[0]))

    # Ruta inicial por cliente.
    route_by_customer: dict[int, list[int]] = {c: [c] for c in range(1, n_customers + 1)}

    savings = []
    for i in range(1, n_customers + 1):
        for j in range(i + 1, n_customers + 1):
            saving = dist[0][i] + dist[0][j] - dist[i][j]
            savings.append((saving, i, j))
    savings.sort(key=lambda item: item[0], reverse=True)

    def load(route: list[int]) -> float:
        return sum(_demand(customer, demands) for customer in route)

    for _saving, i, j in savings:
        route_i = route_by_customer.get(i)
        route_j = route_by_customer.get(j)
        if route_i is None or route_j is None or route_i is route_j:
            continue
        # Solo se pueden unir por los extremos (i y j deben ser extremos).
        if route_i[0] != i and route_i[-1] != i:
            continue
        if route_j[0] != j and route_j[-1] != j:
            continue
        if load(route_i) + load(route_j) > capacity:
            continue
        # Une rotando para que el extremo quede contiguo.
        if route_i[-1] == i:
            route_i.extend(route_j)
        else:
            route_i = list(reversed(route_i))
            route_i.extend(route_j)
        for customer in route_j:
            route_by_customer[customer] = route_i

    routes = list({id(route): route for route in route_by_customer.values()}.values())
    solution = _wrap_routes(routes, dist, time)
    solution.label = "clarke_wright"
    return solution


# --- Algoritmo Genético básico -----------------------------------------------


def _decode_permutation(
    perm: list[int],
    demands: list[float],
    capacity: float,
    vehicles: int,
) -> tuple[list[list[int]], list[int]]:
    routes: list[list[int]] = []
    current: list[int] = []
    load = 0.0
    for customer in perm:
        demand = _demand(customer, demands)
        if load + demand <= capacity:
            current.append(customer)
            load += demand
            continue
        if len(routes) < vehicles - 1:
            if current:
                routes.append(current)
            current = [customer]
            load = demand
        else:
            # Último vehículo: no cabe → cliente sin cubrir.
            if load + demand > capacity and current:
                routes.append(current)
                current = []
                load = 0.0
            if load + demand <= capacity:
                current.append(customer)
                load += demand
            # else: permanece sin cubrir (se omite)
    if current:
        routes.append(current)
    remaining = [c for c in perm if not any(c in route for route in routes)]
    return routes, remaining


def _fitness(
    perm: list[int],
    demands: list[float],
    capacity: float,
    vehicles: int,
    dist: list[list[float]],
) -> tuple[float, list[list[int]], list[int]]:
    routes, uncovered = _decode_permutation(perm, demands, capacity, vehicles)
    total = 0.0
    for route in routes:
        total += sum(dist[a][b] for a, b in zip([0] + route, route + [0]))
    total += len(uncovered) * UNCOVERED_PENALTY_KM * 1000.0
    return total, routes, uncovered


def _order_crossover(parent_a: list[int], parent_b: list[int], rng: random.Random) -> list[int]:
    size = len(parent_a)
    start = rng.randrange(size)
    end = rng.randrange(start + 1, size + 1)
    segment = parent_a[start:end]
    segment_set = set(segment)
    rest = [gene for gene in parent_b if gene not in segment_set]
    return rest[:start] + segment + rest[start:]


def genetic_algorithm_cvrp(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist: list[list[float]],
    time: list[list[float]],
    *,
    seed: int = 1,
    population_size: int = 34,
    generations: int = 70,
) -> HeuristicSolution:
    if n_customers <= 0 or not capacities:
        return HeuristicSolution(label="genetic")
    capacity = max(1.0, float(capacities[0]))
    vehicles = len(capacities)
    rng = random.Random(seed)
    customers = list(range(1, n_customers + 1))

    population: list[list[int]] = []
    for _ in range(population_size):
        perm = customers[:]
        rng.shuffle(perm)
        population.append(perm)

    best_perm = population[0][:]
    best_fitness = float("inf")

    def evaluate(perm: list[int]) -> float:
        nonlocal best_perm, best_fitness
        fitness, _routes, _uncovered = _fitness(perm, demands, capacity, vehicles, dist)
        if fitness < best_fitness:
            best_fitness = fitness
            best_perm = perm[:]
        return fitness

    for _ in range(generations):
        scored = sorted((evaluate(perm), idx, perm) for idx, perm in enumerate(population))
        scored = scored[:population_size]
        next_pop: list[list[int]] = [perm for _f, _idx, perm in scored[:2]]
        while len(next_pop) < population_size:
            parent_a = rng.choice(population)
            parent_b = rng.choice(population)
            child = _order_crossover(parent_a, parent_b, rng)
            if rng.random() < 0.15:
                pos_a = rng.randrange(n_customers)
                pos_b = rng.randrange(n_customers)
                child[pos_a], child[pos_b] = child[pos_b], child[pos_a]
            next_pop.append(child)
        population = next_pop

    _final, routes, uncovered = _fitness(best_perm, demands, capacity, vehicles, dist)
    solution = _wrap_routes(routes, dist, time)
    solution.label = "genetic"
    solution.uncovered = uncovered
    return solution


# --- Inserción por arrepentimiento (regret) y ALNS (F7) ----------------------


def _routes_cost(routes: list[list[int]], dist: list[list[float]]) -> float:
    total = 0.0
    for route in routes:
        full = [0] + route + [0]
        total += sum(dist[a][b] for a, b in zip(full, full[1:]))
    return total


def _split_routes(solution: HeuristicSolution) -> list[list[int]]:
    return [[customer for customer in route if customer != 0] for route in solution.vehicle_routes if any(c != 0 for c in route)]


def _insertion_options(
    customer: int,
    routes: list[list[int]],
    loads: list[float],
    demands: list[float],
    capacity: float,
    vehicles: int,
    dist: list[list[float]],
) -> list[tuple[float, int, int]]:
    demand = _demand(customer, demands)
    options: list[tuple[float, int, int]] = []
    for idx, route in enumerate(routes):
        if loads[idx] + demand > capacity:
            continue
        for pos in range(len(route) + 1):
            prev = route[pos - 1] if pos > 0 else 0
            nxt = route[pos] if pos < len(route) else 0
            delta = dist[prev][customer] + dist[customer][nxt] - dist[prev][nxt]
            options.append((delta, idx, pos))
    if len(routes) < vehicles:
        options.append((dist[0][customer] + dist[customer][0], len(routes), 0))
    options.sort()
    return options


def _regret_insert(
    pending: list[int],
    routes: list[list[int]],
    loads: list[float],
    demands: list[float],
    capacity: float,
    vehicles: int,
    dist: list[list[float]],
    k: int,
) -> list[int]:
    """Inserta los clientes pendientes por mayor arrepentimiento. Devuelve los no insertados."""
    remaining = list(pending)
    while remaining:
        best_customer: int | None = None
        best_key: tuple[float, float, int] | None = None
        best_option: tuple[float, int, int] | None = None
        for customer in remaining:
            options = _insertion_options(customer, routes, loads, demands, capacity, vehicles, dist)
            if not options:
                continue
            best_delta = options[0][0]
            kth_delta = options[min(k, len(options)) - 1][0]
            regret = kth_delta - best_delta
            key = (regret, -best_delta, -customer)
            if best_key is None or key > best_key:
                best_key = key
                best_customer = customer
                best_option = options[0]
        if best_customer is None or best_option is None:
            break
        _delta, idx, pos = best_option
        if idx == len(routes):
            routes.append([best_customer])
            loads.append(_demand(best_customer, demands))
        else:
            routes[idx].insert(pos, best_customer)
            loads[idx] += _demand(best_customer, demands)
        remaining.remove(best_customer)
    return remaining


def regret_insertion_cvrp(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist: list[list[float]],
    time: list[list[float]],
    *,
    seed: int = 1,
    k: int = 3,
) -> HeuristicSolution:
    """Inserción por arrepentimiento (regret-k). Determinista; `seed` por compatibilidad."""
    if n_customers <= 0 or not capacities:
        return HeuristicSolution(label="regret")
    capacity = max(1.0, float(capacities[0]))
    vehicles = len(capacities)
    routes: list[list[int]] = []
    loads: list[float] = []
    leftover = _regret_insert(
        list(range(1, n_customers + 1)), routes, loads, demands, capacity, vehicles, dist, k
    )
    solution = _wrap_routes(routes, dist, time)
    solution.label = "regret"
    solution.uncovered = sorted(leftover)
    return solution


def alns_cvrp(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist: list[list[float]],
    time: list[list[float]],
    *,
    seed: int = 1,
    iterations: int = 40,
    destroy_fraction: float = 0.3,
    k: int = 3,
) -> HeuristicSolution:
    """ALNS: parte de regret y alterna destrucción aleatoria + reparación regret.

    Determinista por semilla. Mejora monótona sobre el plan inicial (acepta sólo
    si no empeora), por lo que la distancia nunca es peor que la de regret.
    """
    base = regret_insertion_cvrp(n_customers, demands, capacities, dist, time, seed=seed, k=k)
    if n_customers <= 0 or not capacities:
        base.label = "alns"
        return base

    capacity = max(1.0, float(capacities[0]))
    vehicles = len(capacities)
    rng = random.Random(seed)
    routes = _split_routes(base)
    current_cost = _routes_cost(routes, dist)
    best_routes = [list(route) for route in routes]
    best_cost = current_cost

    for _ in range(max(0, iterations)):
        assigned = [customer for route in routes for customer in route]
        if len(assigned) < 2:
            break
        quantity = max(1, int(len(assigned) * destroy_fraction))
        removed = rng.sample(assigned, min(quantity, len(assigned)))
        candidate = [list(route) for route in routes]
        for customer in removed:
            for route in candidate:
                if customer in route:
                    route.remove(customer)
                    break
        candidate = [route for route in candidate if route]
        loads = [sum(_demand(customer, demands) for customer in route) for route in candidate]
        _regret_insert(removed, candidate, loads, demands, capacity, vehicles, dist, k)
        candidate_cost = _routes_cost(candidate, dist)
        if candidate_cost <= current_cost:
            routes = candidate
            current_cost = candidate_cost
            if candidate_cost < best_cost:
                best_cost = candidate_cost
                best_routes = [list(route) for route in candidate]

    solution = _wrap_routes(best_routes, dist, time)
    solution.label = "alns"
    solution.uncovered = list(base.uncovered)
    return solution


def _customer_edges(routes: list[list[int]]) -> set[tuple[int, int]]:
    edges: set[tuple[int, int]] = set()
    for route in routes:
        sequence = [customer for customer in route if customer != 0]
        edges.update(zip(sequence, sequence[1:]))
    return edges


def plan_stability_pct(routes_a: list[list[int]], routes_b: list[list[int]]) -> float:
    """Estabilidad del plan: % de arcos entre clientes compartidos (índice de Jaccard)."""
    edges_a = _customer_edges(routes_a)
    edges_b = _customer_edges(routes_b)
    union = edges_a | edges_b
    if not union:
        return 100.0
    return round(len(edges_a & edges_b) / len(union) * 100, 1)
