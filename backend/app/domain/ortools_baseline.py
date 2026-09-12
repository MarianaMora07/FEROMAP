"""Baseline exacto con OR-Tools (F7, post-defensa).

Dependencia **opcional**: `ortools` se importa de forma perezosa. El camino ACO por
defecto no lo usa; solo se activa con `SOLVER_BACKEND=ortools` o desde el benchmark
comparativo. Si la dependencia no está instalada, se lanza un error explícito.
"""

from __future__ import annotations

import importlib.util

from app.domain.vrp_heuristics import HeuristicSolution, _wrap_routes


class OrtoolsUnavailableError(RuntimeError):
    """Se pidió el baseline OR-Tools pero la dependencia no está instalada."""


def available() -> bool:
    return importlib.util.find_spec("ortools") is not None


def solve_cvrp_ortools(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist: list[list[float]],
    time: list[list[float]],
    *,
    seed: int = 1,
    time_limit_seconds: float = 5.0,
) -> HeuristicSolution:
    """CP-SAT/Routing exacto-near para CVRP con capacidades homogéneas.

    Índices como el motor ACO: 0 = depósito, 1..N = clientes. `dist`/`time` en metros.
    """
    if not available():
        raise OrtoolsUnavailableError(
            "OR-Tools no está instalado. Agrega 'ortools' a backend/requirements.txt y "
            "reconstruye la imagen para habilitar el baseline exacto (F7)."
        )

    from ortools.constraint_solver import pywrapcp, routing_enums_pb2

    if n_customers <= 0 or not capacities:
        return HeuristicSolution(label="ortools")

    vehicles = len(capacities)
    capacity = max(1, round(max(capacities)))
    demands_int = [max(0, round(value)) for value in demands]

    manager = pywrapcp.RoutingIndexManager(n_customers + 1, vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return round(dist[from_node][to_node])

    transit_callback = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback)

    def demand_callback(from_index: int) -> int:
        node = manager.IndexToNode(from_index)
        return demands_int[node - 1] if node >= 1 else 0

    demand_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_index,
        0,
        [capacity] * vehicles,
        True,
        "Capacity",
    )

    parameters = pywrapcp.DefaultRoutingSearchParameters()
    parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    parameters.time_limit.FromSeconds(max(1, int(time_limit_seconds)))
    parameters.random_seed = seed

    solution = routing.SolveWithParameters(parameters)
    if solution is None:
        return HeuristicSolution(label="ortools")

    routes: list[list[int]] = []
    covered: set[int] = set()
    for vehicle in range(vehicles):
        index = routing.Start(vehicle)
        sequence: list[int] = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                sequence.append(node)
                covered.add(node)
            index = solution.Value(routing.NextVar(index))
        if sequence:
            routes.append(sequence)

    wrapped = _wrap_routes(routes, dist, time)
    wrapped.label = "ortools"
    wrapped.uncovered = sorted(set(range(1, n_customers + 1)) - covered)
    return wrapped
