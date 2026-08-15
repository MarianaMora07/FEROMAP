"""Motor de optimización VRP con metaheurística ACO sobre grafo OSMnx."""

from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Protocol

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Simulation, Vehicle
from app.domain.crew_service_time import (
    BASE_SERVICE_SECONDS,
    DEFAULT_IDEAL_OPERATORS,
    normalize_operators_shortage,
    resolve_effective_assigned,
    route_service_seconds,
    service_time_seconds_per_stop,
)
from app.domain.landfill_service_time import (
    landfill_node_index,
    route_operational_elapsed_seconds,
)
from app.services.operational_facilities_service import resolve_operational_facilities
from app.services.scenario_parameters import (
    apply_simulation_parameter_modifiers,
    build_applied_crew_modifiers,
    normalize_aco_ants,
    normalize_aco_iterations,
    normalize_duration_hours,
    normalize_rain_intensity,
    normalize_waste_level_pct,
)
from app.services.aco_parallel import resolve_aco_parallel_workers, run_ant_solutions
from app.services.distance_matrix_cache import resolve_distance_matrix
from app.services.graph_service import (
    DEPOT_LAT,
    DEPOT_LON,
    apply_scenario_weights,
    build_tour_coordinates,
    graph_load_source,
    load_road_graph,
    nearest_node,
    path_metrics_between_nodes,
)
from app.services.geo_service import fill_level_pct
from app.services.operations_service import dispatch_optimized_routes
from app.services.scenario_utils import normalize_scenario_id
from app.services.seed_loader import load_seed
from app.services.vehicle_service import (
    ASSIGNABLE_STATUSES,
    get_active_routes_by_vehicle_id,
    resolve_vehicle_assigned_operators,
    resolve_vehicle_driver_id,
)

logger = logging.getLogger(__name__)

ACO_ANTS = settings.aco_ants
ACO_ITERATIONS = settings.aco_iterations
ACO_PATIENCE = settings.aco_patience
ACO_ALPHA = 1.0
ACO_BETA = 3.0
ACO_RHO = 0.12
AVG_SPEED_KMH = 25.0
FUEL_L_PER_KM = 0.35
CO2_KG_PER_LITER = 2.68


class OptimizationCancelledError(Exception):
    """Optimización cancelada por solicitud del cliente."""


class OptimizationProgressReporter(Protocol):
    def cancelled(self) -> bool: ...
    def check_cancelled(self) -> None: ...
    def advance(self, phase: str, message: str, log_type: str = "info") -> None: ...
    def set_aco_progress(
        self,
        iteration: int,
        total: int,
        *,
        best_cost_m: float = 0.0,
        iteration_best_m: float = 0.0,
    ) -> None: ...


@dataclass
class CustomerNode:
    point_id: int
    code: str
    graph_node: int
    demand_kg: float
    fill_pct: int
    lon: float
    lat: float


@dataclass
class VehicleUnit:
    vehicle_id: int
    driver_id: int
    capacity_kg: float
    fuel_rate: float
    ideal_operators: int
    assigned_operators: int


@dataclass
class RouteSolution:
    vehicle_routes: list[list[int]] = field(default_factory=list)
    distance_m: float = 0.0
    duration_s: float = 0.0
    aco_iterations_run: int = 0
    aco_stopped_early: bool = False
    aco_parallel_workers: int = 1
    aco_convergence: list[dict[str, float | int]] = field(default_factory=list)
    uncovered_customer_indices: list[int] = field(default_factory=list)


def _landfill_idx(n_customers: int) -> int:
    return landfill_node_index(n_customers)


def _is_collection_idx(idx: int, n_customers: int) -> bool:
    return 1 <= idx <= n_customers


def _route_collection_stop_count(route: list[int], n_customers: int) -> int:
    return sum(1 for idx in route if _is_collection_idx(idx, n_customers))


def _count_landfill_visits(route: list[int], landfill_idx: int) -> int:
    return sum(1 for idx in route if idx == landfill_idx)


def _served_customer_indices(solution: RouteSolution, n_customers: int) -> set[int]:
    served: set[int] = set()
    for route in solution.vehicle_routes:
        for idx in route:
            if _is_collection_idx(idx, n_customers):
                served.add(idx)
    return served


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _matrix_pair_metrics(
    graph: nx.MultiDiGraph,
    depot_node: int,
    customers: list[CustomerNode],
    i: int,
    j: int,
    *,
    depot_lon: float,
    depot_lat: float,
    landfill_node: int,
    landfill_lon: float,
    landfill_lat: float,
) -> tuple[float, float]:
    landfill_idx = _landfill_idx(len(customers))
    graph_nodes = [depot_node] + [c.graph_node for c in customers] + [landfill_node]

    def coords_for(index: int) -> tuple[float, float]:
        if index == 0:
            return depot_lon, depot_lat
        if index == landfill_idx:
            return landfill_lon, landfill_lat
        customer = customers[index - 1]
        return customer.lon, customer.lat

    d_m, t_s = path_metrics_between_nodes(graph, graph_nodes[i], graph_nodes[j])
    if not math.isfinite(d_m) or d_m <= 0:
        lon_i, lat_i = coords_for(i)
        lon_j, lat_j = coords_for(j)
        d_m = _haversine_m(lon_i, lat_i, lon_j, lat_j)
        t_s = d_m / 1000 / AVG_SPEED_KMH * 3600
    return d_m, t_s


def _build_distance_matrix(
    graph: nx.MultiDiGraph | None,
    depot_node: int,
    customers: list[CustomerNode],
    *,
    depot_lon: float,
    depot_lat: float,
    landfill_node: int,
    landfill_lon: float,
    landfill_lat: float,
) -> tuple[list[list[float]], list[list[float]]]:
    """Matriz depósito + clientes + vertedero (N+2 nodos)."""
    landfill_idx = _landfill_idx(len(customers))
    n = landfill_idx + 1
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]

    if graph is not None:
        graph_nodes = [depot_node] + [c.graph_node for c in customers] + [landfill_node]
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                d_m, t_s = path_metrics_between_nodes(graph, graph_nodes[i], graph_nodes[j])
                if not math.isfinite(d_m) or d_m <= 0:
                    if i == 0:
                        lon_i, lat_i = depot_lon, depot_lat
                    elif i == landfill_idx:
                        lon_i, lat_i = landfill_lon, landfill_lat
                    else:
                        lon_i, lat_i = customers[i - 1].lon, customers[i - 1].lat
                    if j == 0:
                        lon_j, lat_j = depot_lon, depot_lat
                    elif j == landfill_idx:
                        lon_j, lat_j = landfill_lon, landfill_lat
                    else:
                        lon_j, lat_j = customers[j - 1].lon, customers[j - 1].lat
                    d_m = _haversine_m(lon_i, lat_i, lon_j, lat_j)
                    t_s = d_m / 1000 / AVG_SPEED_KMH * 3600
                dist[i][j] = d_m
                time[i][j] = t_s
        return dist, time

    points = (
        [(depot_lon, depot_lat)]
        + [(c.lon, c.lat) for c in customers]
        + [(landfill_lon, landfill_lat)]
    )
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d_m = _haversine_m(points[i][0], points[i][1], points[j][0], points[j][1])
            dist[i][j] = d_m
            time[i][j] = d_m / 1000 / AVG_SPEED_KMH * 3600
    return dist, time


def _route_cost(
    route: list[int],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> tuple[float, float]:
    if len(route) < 2:
        return 0.0, 0.0
    d = 0.0
    t = 0.0
    for i, j in zip(route[:-1], route[1:]):
        d += dist_matrix[i][j]
        t += time_matrix[i][j]
    return d, t


def compute_service_time_sec(
    vehicle: VehicleUnit,
    operators_shortage: int | None = None,
) -> int:
    """Segundos de servicio por parada según dotación efectiva del vehículo."""
    assigned_effective = resolve_effective_assigned(
        vehicle.assigned_operators,
        ideal=vehicle.ideal_operators,
        operators_shortage=operators_shortage,
    )
    return service_time_seconds_per_stop(assigned_effective, ideal=vehicle.ideal_operators)


def _route_stop_count(route: list[int], n_customers: int) -> int:
    return _route_collection_stop_count(route, n_customers)


def _route_operational_duration(
    route: list[int],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    vehicle: VehicleUnit,
    operators_shortage: int | None = None,
    *,
    n_customers: int,
    unload_seconds: int = 0,
) -> tuple[float, float, int]:
    """Distancia (m), viaje (s) y duración operativa total (viaje + paradas + vertedero)."""
    landfill_idx = _landfill_idx(n_customers)
    distance_m, travel_s = _route_cost(route, dist_matrix, time_matrix)
    stops = _route_collection_stop_count(route, n_customers)
    landfill_visits = _count_landfill_visits(route, landfill_idx)
    assigned_effective = resolve_effective_assigned(
        vehicle.assigned_operators,
        ideal=vehicle.ideal_operators,
        operators_shortage=operators_shortage,
    )
    service_per_stop = service_time_seconds_per_stop(assigned_effective, ideal=vehicle.ideal_operators)
    unload_minutes = max(1, int(round(unload_seconds / 60))) if unload_seconds > 0 else None
    total_s = route_operational_elapsed_seconds(
        travel_s,
        stops,
        service_per_stop,
        landfill_visits,
        unload_minutes=unload_minutes,
    )
    return distance_m, travel_s, total_s


def _fleet_crew_summary(assignments: list[tuple[int, int]]) -> tuple[str, str]:
    if not assignments:
        ideal = DEFAULT_IDEAL_OPERATORS
        return f"{ideal}/{ideal}", f"{ideal}/{ideal} (conductor + {ideal - 1} operarios)"
    ideals = {ideal for _, ideal in assignments}
    ideal = ideals.pop() if len(ideals) == 1 else DEFAULT_IDEAL_OPERATORS
    assigned_values = [assigned for assigned, _ in assignments]
    lo, hi = min(assigned_values), max(assigned_values)
    if lo == hi:
        field = max(0, lo - 1)
        return f"{lo}/{ideal}", f"{lo}/{ideal} (conductor + {field} operarios)"
    return f"{lo}–{hi}/{ideal}", f"{lo}–{hi}/{ideal} (dotación variable por ruta)"


def _solution_operational_metrics(
    solution: RouteSolution,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    vehicles: list[VehicleUnit],
    operators_shortage: int | None = None,
    *,
    n_customers: int,
    unload_seconds: int = 0,
    shift_budget_seconds: int = 0,
) -> dict[str, Any]:
    travel_s = 0.0
    service_s = 0
    unload_s = 0
    landfill_trips = 0
    stop_count = 0
    crew_assignments: list[tuple[int, int]] = []

    for v_idx, route in enumerate(solution.vehicle_routes):
        if len(route) <= 2:
            continue
        vehicle = vehicles[min(v_idx, len(vehicles) - 1)]
        _, route_travel, route_total = _route_operational_duration(
            route,
            dist_matrix,
            time_matrix,
            vehicle,
            operators_shortage,
            n_customers=n_customers,
            unload_seconds=unload_seconds,
        )
        stops = _route_collection_stop_count(route, n_customers)
        landfill_idx = _landfill_idx(n_customers)
        visits = _count_landfill_visits(route, landfill_idx)
        route_service = route_total - int(round(route_travel)) - visits * unload_seconds
        travel_s += route_travel
        service_s += max(0, route_service)
        unload_s += visits * unload_seconds
        landfill_trips += visits
        stop_count += stops
        assigned_effective = resolve_effective_assigned(
            vehicle.assigned_operators,
            ideal=vehicle.ideal_operators,
            operators_shortage=operators_shortage,
        )
        crew_assignments.append((assigned_effective, vehicle.ideal_operators))

    crew_assignment, crew_label = _fleet_crew_summary(crew_assignments)
    total_s = int(round(travel_s)) + service_s + unload_s
    shift_utilization = min(100.0, total_s / shift_budget_seconds * 100.0) if shift_budget_seconds > 0 else 0.0
    return {
        "travel_s": travel_s,
        "service_s": service_s,
        "unload_s": unload_s,
        "landfill_trips": landfill_trips,
        "total_s": total_s,
        "stop_count": stop_count,
        "crew_assignment": crew_assignment,
        "crew_label": crew_label,
        "shift_budget_seconds": shift_budget_seconds,
        "shift_utilization_pct": round(shift_utilization, 1),
    }


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


def _two_opt(route: list[int], dist_matrix: list[list[float]]) -> list[int]:
    """Mejora local 2-opt sobre índices de clientes (sin tocar depósito en extremos)."""
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


def _aco_cvrp(
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    shift_budget_sec: float,
    unload_sec: float,
    service_secs: list[float],
    aco_ants: int = ACO_ANTS,
    aco_iterations: int = ACO_ITERATIONS,
    aco_patience: int = ACO_PATIENCE,
    seed: int = 42,
    cancel_check: Callable[[], bool] | None = None,
    on_iteration: Callable[[int, int, float, float], None] | None = None,
) -> RouteSolution:
    """Ant Colony Optimization para CVRP multi-viaje con vertedero y jornada."""
    parallel_workers = resolve_aco_parallel_workers(aco_ants)
    process_pool = None
    if parallel_workers > 1:
        from concurrent.futures import ProcessPoolExecutor

        process_pool = ProcessPoolExecutor(max_workers=parallel_workers)

    n_nodes = landfill_idx + 1
    pheromone = [[1.0 / max(dist_matrix[i][j], 1.0) for j in range(n_nodes)] for i in range(n_nodes)]

    best_routes: list[list[int]] = []
    best_cost = float("inf")
    best_time = float("inf")
    best_uncovered: list[int] = list(range(1, n_customers + 1))
    stall_count = 0
    iterations_run = 0
    stopped_early = False
    patience = max(0, aco_patience)
    convergence: list[dict[str, float | int]] = []

    try:
        for iteration in range(aco_iterations):
            iterations_run = iteration + 1
            if cancel_check and cancel_check():
                raise OptimizationCancelledError()

            iteration_best: list[list[int]] = []
            iteration_cost = float("inf")
            iteration_uncovered: list[int] = list(range(1, n_customers + 1))
            improved = False

            ant_seeds = [seed + iteration * aco_ants + ant_idx for ant_idx in range(aco_ants)]
            ant_results = run_ant_solutions(
                ant_seeds=ant_seeds,
                n_customers=n_customers,
                demands=demands,
                capacities=capacities,
                dist_matrix=dist_matrix,
                time_matrix=time_matrix,
                pheromone=pheromone,
                max_workers=parallel_workers,
                executor=process_pool,
                landfill_idx=landfill_idx,
                shift_budget_sec=shift_budget_sec,
                unload_sec=unload_sec,
                service_secs=service_secs,
            )
            for routes, cost, _dur, uncovered in ant_results:
                if cost < iteration_cost or (cost == iteration_cost and len(uncovered) < len(iteration_uncovered)):
                    iteration_cost = cost
                    iteration_best = [route[:] for route in routes]
                    iteration_uncovered = uncovered[:]

            if iteration_best and (
                iteration_cost < best_cost
                or (iteration_cost == best_cost and len(iteration_uncovered) < len(best_uncovered))
            ):
                best_cost = iteration_cost
                best_routes = iteration_best
                best_uncovered = iteration_uncovered
                _, best_time = _evaluate_solution(best_routes, dist_matrix, time_matrix)
                improved = True

            record_best = best_cost if math.isfinite(best_cost) else iteration_cost
            record_iter = iteration_cost if math.isfinite(iteration_cost) else record_best
            convergence.append(
                {
                    "iteration": iterations_run,
                    "bestDistanceKm": round(record_best / 1000, 3),
                    "iterationBestDistanceKm": round(record_iter / 1000, 3),
                }
            )
            if on_iteration:
                on_iteration(iterations_run, aco_iterations, record_best, record_iter)

            if improved:
                stall_count = 0
            elif patience > 0:
                stall_count += 1
                if stall_count >= patience:
                    stopped_early = True
                    break

            for i in range(n_nodes):
                for j in range(n_nodes):
                    pheromone[i][j] *= 1 - ACO_RHO
            if iteration_best:
                for route in iteration_best:
                    for i, j in zip(route[:-1], route[1:]):
                        pheromone[i][j] += 1.0 / max(iteration_cost, 1.0)
    finally:
        if process_pool is not None:
            process_pool.shutdown(wait=True)

    return RouteSolution(
        vehicle_routes=best_routes,
        distance_m=best_cost,
        duration_s=best_time,
        aco_iterations_run=iterations_run,
        aco_stopped_early=stopped_early,
        aco_parallel_workers=parallel_workers,
        aco_convergence=convergence,
        uncovered_customer_indices=best_uncovered,
    )


def _baseline_route(
    n_customers: int,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> RouteSolution:
    """Ruta actual: visita fija por orden de código (ineficiente)."""
    route = [0] + list(range(1, n_customers + 1)) + [0]
    d, t = _route_cost(route, dist_matrix, time_matrix)
    return RouteSolution(vehicle_routes=[route], distance_m=d, duration_s=t)


def _critical_coverage_pct(customers: list[CustomerNode], served_codes: set[str]) -> int:
    critical = [c for c in customers if c.fill_pct >= 80]
    if not critical:
        return 100
    served = sum(1 for c in critical if c.code in served_codes)
    return int(round(served / len(critical) * 100))


def _route_stops_for_geojson(
    route_indices: list[int],
    customers: list[CustomerNode],
    *,
    landfill_lon: float,
    landfill_lat: float,
) -> list[dict[str, Any]]:
    """Paradas ordenadas para propiedades GeoJSON (incluye vertedero)."""
    n_customers = len(customers)
    landfill_idx = _landfill_idx(n_customers)
    stops: list[dict[str, Any]] = []
    seq = 0
    for idx in route_indices:
        if idx == 0:
            continue
        seq += 1
        if idx == landfill_idx:
            stops.append(
                {
                    "sequence": seq,
                    "lng": landfill_lon,
                    "lat": landfill_lat,
                    "code": "VERTEDERO",
                    "stopType": "landfill",
                }
            )
            continue
        if not _is_collection_idx(idx, n_customers):
            continue
        customer = customers[idx - 1]
        stops.append(
            {
                "sequence": seq,
                "lng": customer.lon,
                "lat": customer.lat,
                "code": customer.code,
                "stopType": "collection",
            }
        )
    return stops


def _build_geojson_feature(
    coordinates: list[list[float]],
    *,
    route_id: str,
    kind: str,
    label: str,
    distance_km: float,
    duration_min: int,
    stops: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if coordinates and coordinates[0] != coordinates[-1]:
        coordinates = coordinates + [coordinates[0]]
    properties: dict[str, Any] = {
        "id": route_id,
        "type": kind,
        "label": label,
        "distanceKm": round(distance_km, 1),
        "durationMin": duration_min,
    }
    if stops:
        properties["stops"] = stops
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {"type": "LineString", "coordinates": coordinates},
    }


def _route_geometry(
    graph: nx.MultiDiGraph,
    customers: list[CustomerNode],
    route_indices: list[int],
    *,
    depot_lon: float,
    depot_lat: float,
    landfill_lon: float,
    landfill_lat: float,
) -> list[list[float]]:
    """Geometría vial cuando hay camino; si no, segmento directo entre puntos."""
    landfill_idx = _landfill_idx(len(customers))
    depot_node = nearest_node(graph, depot_lon, depot_lat)
    landfill_node = nearest_node(graph, landfill_lon, landfill_lat)
    node_seq: list[int] = []
    coord_seq: list[list[float]] = [[depot_lon, depot_lat]]

    for idx in route_indices:
        if idx == 0:
            node_seq.append(depot_node)
            continue
        if idx == landfill_idx:
            node_seq.append(landfill_node)
            coord_seq.append([landfill_lon, landfill_lat])
            continue
        customer = customers[idx - 1]
        node_seq.append(customer.graph_node)
        coord_seq.append([customer.lon, customer.lat])

    if not node_seq or node_seq[-1] != depot_node:
        node_seq.append(depot_node)
        coord_seq.append([depot_lon, depot_lat])

    try:
        road_coords = build_tour_coordinates(graph, node_seq)
        if len(road_coords) >= 4:
            return road_coords
    except Exception:
        pass
    return coord_seq


def _routes_to_geojson(
    graph: nx.MultiDiGraph,
    solution: RouteSolution,
    customers: list[CustomerNode],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    kind: str,
    label: str,
    vehicles: list[VehicleUnit] | None = None,
    operators_shortage: int | None = None,
    depot_lon: float = DEPOT_LON,
    depot_lat: float = DEPOT_LAT,
    landfill_lon: float = DEPOT_LON,
    landfill_lat: float = DEPOT_LAT,
    unload_seconds: int = 0,
) -> dict[str, Any]:
    n_customers = len(customers)
    features = []
    for v_idx, route_indices in enumerate(solution.vehicle_routes):
        if len(route_indices) < 2:
            continue
        coords = _route_geometry(
            graph,
            customers,
            route_indices,
            depot_lon=depot_lon,
            depot_lat=depot_lat,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
        )
        vehicle = vehicles[min(v_idx, len(vehicles) - 1)] if vehicles else None
        if vehicle is not None:
            d, _, total_s = _route_operational_duration(
                route_indices,
                dist_matrix,
                time_matrix,
                vehicle,
                operators_shortage,
                n_customers=n_customers,
                unload_seconds=unload_seconds,
            )
        else:
            d, t = _route_cost(route_indices, dist_matrix, time_matrix)
            total_s = int(round(t))

        stops = _route_stops_for_geojson(
            route_indices,
            customers,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
        )
        features.append(
            _build_geojson_feature(
                coords,
                route_id=f"route-{kind}" if v_idx == 0 else f"route-{kind}-v{v_idx + 1}",
                kind=kind,
                label=label if v_idx == 0 else f"{label} — vehículo {v_idx + 1}",
                distance_km=d / 1000,
                duration_min=int(total_s / 60),
                stops=stops,
            )
        )
    return {"type": "FeatureCollection", "features": features}


def _merge_route_features(features: list[dict[str, Any]], kind: str, label: str) -> dict[str, Any]:
    if not features:
        return {"type": "FeatureCollection", "features": []}
    if len(features) == 1:
        return {"type": "FeatureCollection", "features": features}

    all_coords: list[list[float]] = []
    all_stops: list[dict[str, Any]] = []
    total_km = 0.0
    total_min = 0
    for feat in features:
        coords = feat["geometry"]["coordinates"]
        if all_coords and coords and coords[0] == all_coords[-1]:
            coords = coords[1:]
        all_coords.extend(coords)
        total_km += feat["properties"]["distanceKm"]
        total_min += feat["properties"]["durationMin"]
        for stop in feat["properties"].get("stops", []):
            all_stops.append({**stop, "sequence": len(all_stops) + 1})

    merged = _build_geojson_feature(
        all_coords,
        route_id=f"route-{kind}",
        kind=kind,
        label=label,
        distance_km=total_km,
        duration_min=total_min,
        stops=all_stops or None,
    )
    return {"type": "FeatureCollection", "features": [merged]}


def _compute_kpis(
    current: RouteSolution,
    optimized: RouteSolution,
    customers: list[CustomerNode],
    served_codes: set[str],
    vehicles: list[VehicleUnit],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    operators_shortage: int | None = None,
    workday_hours: int | None = None,
    unload_seconds: int = 0,
    shift_budget_seconds: int = 0,
    uncovered_point_codes: list[str] | None = None,
) -> dict[str, Any]:
    n_customers = len(customers)
    cur_km = current.distance_m / 1000
    opt_km = optimized.distance_m / 1000
    cur_metrics = _solution_operational_metrics(
        current,
        dist_matrix,
        time_matrix,
        vehicles,
        operators_shortage,
        n_customers=n_customers,
        unload_seconds=unload_seconds,
        shift_budget_seconds=shift_budget_seconds,
    )
    opt_metrics = _solution_operational_metrics(
        optimized,
        dist_matrix,
        time_matrix,
        vehicles,
        operators_shortage,
        n_customers=n_customers,
        unload_seconds=unload_seconds,
        shift_budget_seconds=shift_budget_seconds,
    )
    cur_h = cur_metrics["total_s"] / 3600
    opt_h = opt_metrics["total_s"] / 3600
    workday_h = workday_hours or (shift_budget_seconds / 3600 if shift_budget_seconds else 12)
    cur_fuel = cur_km * FUEL_L_PER_KM
    opt_fuel = opt_km * FUEL_L_PER_KM
    co2_avoided = max(0, (cur_fuel - opt_fuel) * CO2_KG_PER_LITER)
    served_count = len(served_codes)
    coverage_pct = int(round(served_count / n_customers * 100)) if n_customers else 100
    uncovered = uncovered_point_codes or []

    def _breakdown(metrics: dict[str, Any]) -> dict[str, Any]:
        return {
            "travelHours": round(metrics["travel_s"] / 3600, 2),
            "serviceHours": round(metrics["service_s"] / 3600, 2),
            "unloadHours": round(metrics["unload_s"] / 3600, 2),
            "landfillTrips": metrics["landfill_trips"],
            "shiftBudgetHours": round(metrics["shift_budget_seconds"] / 3600, 1),
            "shiftUsedHours": round(metrics["total_s"] / 3600, 2),
            "shiftUtilizationPct": metrics["shift_utilization_pct"],
            "uncoveredPoints": len(uncovered),
            "crewLabel": metrics["crew_label"],
            "crewAssignment": metrics["crew_assignment"],
            "stopCount": metrics["stop_count"],
        }

    active_routes = [route for route in optimized.vehicle_routes if len(route) > 2]
    vehicle_count = max(1, len(active_routes))

    return {
        "distanceKm": {"current": round(cur_km, 1), "optimized": round(opt_km, 1)},
        "durationHours": {"current": round(cur_h, 2), "optimized": round(opt_h, 2)},
        "durationBreakdown": {
            "current": _breakdown(cur_metrics),
            "optimized": _breakdown(opt_metrics),
        },
        "exceedsWorkday": {
            "current": cur_h > workday_h,
            "optimized": opt_h > workday_h,
        },
        "workdayHours": workday_h,
        "fuelLiters": {"current": round(cur_fuel, 1), "optimized": round(opt_fuel, 1)},
        "co2KgAvoided": round(co2_avoided, 1),
        "criticalCoveragePct": {
            "current": _critical_coverage_pct(customers, {c.code for c in customers}),
            "optimized": _critical_coverage_pct(customers, served_codes),
        },
        "coveragePct": {"current": 100, "optimized": coverage_pct},
        "containersServed": served_count,
        "uncoveredPointCodes": uncovered,
        "landfillTrips": opt_metrics["landfill_trips"],
        "landfillTripsPerVehicle": round(opt_metrics["landfill_trips"] / vehicle_count, 2),
        "unloadTimeHours": round(opt_metrics["unload_s"] / 3600, 2),
        "shiftUtilizationPct": opt_metrics["shift_utilization_pct"],
        "uncoveredPoints": len(uncovered),
    }


def _build_engine_metrics(
    *,
    computation_seconds: float,
    aco_seconds: float,
    graph_seconds: float,
    customer_count: int,
    vehicle_count: int,
    aco_ants: int,
    aco_iterations: int,
    aco_iterations_run: int,
    aco_stopped_early: bool,
    aco_patience: int,
    matrix_cache_hit: bool,
    matrix_cache_incremental: bool,
    matrix_patched_cells: int,
    matrix_parent_point_count: int,
    graph_load_source: str,
    aco_parallel_workers: int,
    aco_convergence: list[dict[str, float | int]],
) -> dict[str, Any]:
    overhead = max(0.0, computation_seconds - aco_seconds - graph_seconds)
    return {
        "computationSeconds": round(computation_seconds, 2),
        "acoSeconds": round(aco_seconds, 2),
        "graphLoadSeconds": round(graph_seconds, 2),
        "overheadSeconds": round(overhead, 2),
        "acoAnts": aco_ants,
        "acoIterations": aco_iterations,
        "acoIterationsRun": aco_iterations_run,
        "acoStoppedEarly": aco_stopped_early,
        "acoPatience": aco_patience,
        "matrixCacheHit": matrix_cache_hit,
        "matrixCacheIncremental": matrix_cache_incremental,
        "matrixPatchedCells": matrix_patched_cells,
        "matrixParentPointCount": matrix_parent_point_count,
        "graphLoadSource": graph_load_source,
        "acoParallelWorkers": aco_parallel_workers,
        "acoConvergence": aco_convergence,
        "customers": customer_count,
        "vehicles": vehicle_count,
    }


def _format_computation_log_message(metrics: dict[str, Any]) -> str:
    total = metrics["computationSeconds"]
    aco = metrics["acoSeconds"]
    iterations_run = metrics.get("acoIterationsRun", metrics["acoIterations"])
    early = " · parada anticipada" if metrics.get("acoStoppedEarly") else ""
    cache = " · matriz en caché" if metrics.get("matrixCacheHit") else ""
    incremental = " · matriz incremental" if metrics.get("matrixCacheIncremental") else ""
    graph_src = metrics.get("graphLoadSource")
    graph = f" · grafo {graph_src}" if graph_src and graph_src != "unknown" else ""
    return (
        f"Cálculo completado en {total} s (ACO: {aco} s · "
        f"{metrics['acoAnts']}×{iterations_run}/{metrics['acoIterations']}{early}{cache}{incremental}{graph})"
    )


def _optimization_logs(scenario_label: str, n_points: int, n_vehicles: int) -> list[dict[str, str]]:
    now = datetime.now(timezone.utc).strftime("%H:%M:%S")
    return [
        {"message": f"Iniciando optimización — escenario «{scenario_label}»", "type": "info"},
        {"message": f"Cargando grafo OSMnx (cache data/cache/) — {n_points} puntos de recolección", "type": "info"},
        {"message": "Construyendo matriz de costos sobre red vial (NetworkX shortest path)", "type": "info"},
        {"message": f"Instancia VRP: {n_vehicles} vehículos, demanda = nivel de llenado", "type": "info"},
        {"message": f"Ejecutando metaheurística ACO ({ACO_ANTS} hormigas × {ACO_ITERATIONS} iteraciones)", "type": "progress"},
        {"message": "Aplicando 2-opt local sobre rutas candidatas", "type": "progress"},
        {"message": "Persistiendo rutas optimizadas y waypoints en PostgreSQL", "type": "success"},
        {"message": "Optimización completada — GeoJSON generado desde grafo vial", "type": "success"},
    ]


def build_optimization_vehicle_units(
    db: Session,
    *,
    exclude_vehicle_ids: set[int] | None = None,
    contingency: bool = False,
    limit: int = 4,
    fleet_limit: int | None = None,
) -> list[VehicleUnit]:
    """Arma la flota del VRP usando el conductor asignado a cada vehículo."""
    effective_limit = fleet_limit if fleet_limit is not None and fleet_limit > 0 else limit
    stmt = (
        select(Vehicle)
        .where(Vehicle.status.in_(["available", "in_route"]))
        .options(joinedload(Vehicle.default_driver))
        .order_by(Vehicle.id)
    )
    vehicles_db = db.scalars(stmt).unique().all()
    vehicles_db = [vehicle for vehicle in vehicles_db if vehicle.status in ASSIGNABLE_STATUSES]
    if exclude_vehicle_ids:
        vehicles_db = [vehicle for vehicle in vehicles_db if vehicle.id not in exclude_vehicle_ids]
    if contingency:
        vehicles_db = [vehicle for vehicle in vehicles_db if vehicle.status == "available"]

    active_routes = get_active_routes_by_vehicle_id(db)
    units: list[VehicleUnit] = []
    for vehicle in vehicles_db:
        if len(units) >= effective_limit:
            break
        active_route = active_routes.get(vehicle.id)
        driver_id = resolve_vehicle_driver_id(vehicle, active_route=active_route)
        if driver_id is None:
            logger.warning(
                "Vehículo %s sin conductor asignado; omitido de la optimización",
                vehicle.code,
            )
            continue
        units.append(
            VehicleUnit(
                vehicle_id=vehicle.id,
                driver_id=driver_id,
                capacity_kg=float(vehicle.max_capacity_kg),
                fuel_rate=float(vehicle.fuel_consumption_rate or 1.5),
                ideal_operators=vehicle.ideal_operators_count or DEFAULT_IDEAL_OPERATORS,
                assigned_operators=resolve_vehicle_assigned_operators(vehicle),
            )
        )
    return units


def _resolve_fleet_crew(
    vehicles: list[VehicleUnit],
    operators_shortage: int | None,
) -> list[VehicleUnit]:
    """Aplica ausentismo global antes del motor: assigned_efectivo por vehículo."""
    shortage = normalize_operators_shortage(operators_shortage) or 0
    if shortage == 0:
        return vehicles

    resolved: list[VehicleUnit] = []
    for unit in vehicles:
        effective = resolve_effective_assigned(
            unit.assigned_operators,
            ideal=unit.ideal_operators,
            operators_shortage=shortage,
        )
        resolved.append(
            VehicleUnit(
                vehicle_id=unit.vehicle_id,
                driver_id=unit.driver_id,
                capacity_kg=unit.capacity_kg,
                fuel_rate=unit.fuel_rate,
                ideal_operators=unit.ideal_operators,
                assigned_operators=effective,
            )
        )
    return resolved


def _persist_routes(
    db: Session,
    simulation_id: int,
    vehicles: list[VehicleUnit],
    current_solution: RouteSolution,
    optimized_solution: RouteSolution,
    customers: list[CustomerNode],
    routes_geojson: dict[str, Any],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    operators_shortage: int | None = None,
    *,
    daily_plan_id: int | None = None,
    planning_level: str | None = None,
    unload_seconds: int = 0,
) -> None:
    """Guarda rutas y waypoints en BD."""
    n_customers = len(customers)
    landfill_idx = _landfill_idx(n_customers)
    for kind, solution in [("current", current_solution), ("optimized", optimized_solution)]:
        for v_idx, route_indices in enumerate(solution.vehicle_routes):
            if len(route_indices) <= 2:
                continue
            vehicle = vehicles[min(v_idx, len(vehicles) - 1)]
            d, _, total_s = _route_operational_duration(
                route_indices,
                dist_matrix,
                time_matrix,
                vehicle,
                operators_shortage,
                n_customers=n_customers,
                unload_seconds=unload_seconds,
            )

            db_route = OptimizedRoute(
                vehicle_id=vehicle.vehicle_id,
                driver_id=vehicle.driver_id,
                route_kind=kind,
                total_distance_meters=Decimal(str(round(d, 2))),
                estimated_duration_seconds=total_s,
                status="pending" if kind == "optimized" else "completed",
                simulation_id=simulation_id if kind == "optimized" else None,
                daily_plan_id=daily_plan_id if kind == "optimized" else None,
                planning_level=planning_level if kind == "optimized" else None,
            )
            db.add(db_route)
            db.flush()

            seq = 0
            for idx in route_indices:
                if idx == 0:
                    continue
                seq += 1
                if idx == landfill_idx:
                    db.add(
                        RouteWaypoint(
                            route_id=db_route.id,
                            collection_point_id=None,
                            waypoint_type="landfill",
                            facility_code="landfill",
                            sequence_order=seq,
                            status="pending",
                        )
                    )
                    continue
                if not _is_collection_idx(idx, n_customers):
                    continue
                customer = customers[idx - 1]
                db.add(
                    RouteWaypoint(
                        route_id=db_route.id,
                        collection_point_id=customer.point_id,
                        waypoint_type="collection",
                        sequence_order=seq,
                        status="pending",
                        collected_weight_kg=Decimal(str(round(customer.demand_kg, 2))),
                    )
                )


def run_optimization_engine(
    db: Session,
    scenario_id: str,
    *,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    estimated_duration_hours: int | None = None,
    operators_shortage: int | None = None,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
    collection_point_ids: list[int] | None = None,
    exclude_vehicle_ids: list[int] | None = None,
    contingency_meta: dict[str, Any] | None = None,
    auto_dispatch: bool = False,
    auto_commit: bool = True,
    reporter: OptimizationProgressReporter | None = None,
    operation_date: date | None = None,
    daily_plan_id: int | None = None,
    weekly_plan_id: int | None = None,
    planning_level: str | None = None,
    fleet_limit: int | None = None,
) -> dict[str, Any]:
    """Ejecuta el motor real de optimización y persiste resultados."""
    computation_started = time.perf_counter()
    aco_seconds = 0.0
    graph_seconds = 0.0

    def report(phase: str, message: str, log_type: str = "info") -> None:
        if reporter is not None:
            reporter.advance(phase, message, log_type)

    def cancelled() -> bool:
        return reporter.cancelled() if reporter is not None else False

    report("preparando", "Preparando escenario y parámetros de simulación")
    normalized = normalize_scenario_id(scenario_id)
    scenarios = {row["id"]: row for row in load_seed("scenarios.json")}
    if normalized not in scenarios:
        raise ValueError(f"Escenario desconocido: {scenario_id}")

    scenario = scenarios[normalized]
    scenario_label = scenario["label"]
    if contingency_meta:
        scenario_label = f"{scenario_label} — recálculo por avería"

    report("preparando", f"Iniciando optimización — escenario «{scenario_label}»")
    traffic_mult = float(scenario.get("trafficMultiplier", 1))
    fill_boost = float(scenario.get("fillLevelBoost", 0))

    rain = normalize_rain_intensity(rain_intensity)
    waste = normalize_waste_level_pct(waste_level_pct)
    duration_h = normalize_duration_hours(estimated_duration_hours)
    shortage = normalize_operators_shortage(operators_shortage)
    resolved_aco_ants = normalize_aco_ants(aco_ants)
    resolved_aco_iterations = normalize_aco_iterations(aco_iterations)
    traffic_mult, fill_boost, applied_modifiers = apply_simulation_parameter_modifiers(
        normalized,
        traffic_mult,
        fill_boost,
        rain_intensity=rain,
        waste_level_pct=waste,
    )
    applied_crew_modifiers = build_applied_crew_modifiers(shortage)
    simulation_parameters = {
        "rainIntensity": rain,
        "wasteLevelPct": waste,
        "estimatedDurationHours": duration_h,
        "operatorsShortage": shortage or 0,
        "acoAnts": resolved_aco_ants,
        "acoIterations": resolved_aco_iterations,
        "appliedModifiers": applied_modifiers,
        "appliedCrewModifiers": applied_crew_modifiers,
    }

    if shortage:
        report(
            "preparando",
            (
                f"Ausentismo del turno: {shortage} operario(s) de campo ausentes. "
                "El conductor permanece en cada camión; se aplica antes del cálculo de duración."
            ),
            "warning",
        )

    report("grafo_vial", f"Cargando grafo OSMnx — red vial de Unare")
    graph_started = time.perf_counter()
    base_graph = load_road_graph()
    graph_source = graph_load_source()
    graph = apply_scenario_weights(
        base_graph.copy(),
        traffic_multiplier=traffic_mult,
        scenario_id=normalized,
    )

    points = db.scalars(
        select(CollectionPoint)
        .where(CollectionPoint.deleted_at.is_(None), CollectionPoint.status == "active")
        .options(joinedload(CollectionPoint.sector))
        .order_by(CollectionPoint.code)
    ).all()

    if collection_point_ids is not None:
        allowed = set(collection_point_ids)
        points = [p for p in points if p.id in allowed]
        if not points:
            raise ValueError("No hay puntos de recolección pendientes para reoptimizar")

    report(
        "grafo_vial",
        f"Cargando {len(points)} puntos de recolección activos",
    )

    customers: list[CustomerNode] = []
    for point in points:
        pct = fill_level_pct(point)
        boosted_pct = min(100, pct + int(fill_boost))
        demand = float(point.current_fill_level_kg) * (1 + fill_boost / 100)
        if bool(getattr(point, "priority_boost", False)):
            boosted_pct = min(100, boosted_pct + 25)
            demand = max(demand, float(point.max_capacity_kg) * 0.85)
        if demand <= 0:
            demand = float(point.max_capacity_kg) * boosted_pct / 100
        customers.append(
            CustomerNode(
                point_id=point.id,
                code=point.code,
                graph_node=nearest_node(graph, float(point.longitude), float(point.latitude)),
                demand_kg=demand,
                fill_pct=boosted_pct,
                lon=float(point.longitude),
                lat=float(point.latitude),
            )
        )

    excluded_ids = set(exclude_vehicle_ids or [])
    vehicles = build_optimization_vehicle_units(
        db,
        exclude_vehicle_ids=excluded_ids,
        contingency=contingency_meta is not None,
        limit=4,
        fleet_limit=fleet_limit,
    )
    if not vehicles:
        raise RuntimeError("No hay vehículos con conductor asignado para la optimización")

    vehicles = _resolve_fleet_crew(vehicles, shortage)
    shortage_for_engine = None

    facilities = resolve_operational_facilities(db)
    depot_lon, depot_lat = facilities.depot
    landfill_lon, landfill_lat = facilities.landfill
    unload_seconds = facilities.unload_seconds
    shift_budget_sec = float(facilities.shift_budget_seconds)
    landfill_node = nearest_node(graph, landfill_lon, landfill_lat)
    n_customers = len(customers)
    landfill_idx = _landfill_idx(n_customers)
    service_secs = [
        compute_service_time_sec(vehicle, shortage_for_engine) for vehicle in vehicles
    ]

    report("matriz_costos", "Construyendo matriz de costos sobre red vial (NetworkX shortest path)")
    depot_node = nearest_node(graph, depot_lon, depot_lat)

    def build_full_matrix() -> tuple[list[list[float]], list[list[float]]]:
        return _build_distance_matrix(
            graph,
            depot_node,
            customers,
            depot_lon=depot_lon,
            depot_lat=depot_lat,
            landfill_node=landfill_node,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
        )

    def pair_fn(i: int, j: int) -> tuple[float, float]:
        return _matrix_pair_metrics(
            graph,
            depot_node,
            customers,
            i,
            j,
            depot_lon=depot_lon,
            depot_lat=depot_lat,
            landfill_node=landfill_node,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
        )

    dist_matrix, time_matrix, matrix_meta = resolve_distance_matrix(
        depot_node=depot_node,
        customers=customers,
        scenario_id=normalized,
        traffic_multiplier=traffic_mult,
        build_full_matrix=build_full_matrix,
        pair_fn=pair_fn,
        landfill_lon=landfill_lon,
        landfill_lat=landfill_lat,
    )
    matrix_cache_hit = matrix_meta["matrixCacheHit"]
    if matrix_cache_hit:
        report(
            "matriz_costos",
            f"Matriz de costos reutilizada desde caché ({len(customers)} puntos)",
            "info",
        )
    elif matrix_meta["matrixCacheIncremental"]:
        report(
            "matriz_costos",
            (
                f"Matriz incremental desde caché ({matrix_meta['matrixParentPointCount']} → "
                f"{len(customers)} puntos, {matrix_meta['matrixPatchedCells']} celdas recalculadas)"
            ),
            "info",
        )
    graph_seconds = time.perf_counter() - graph_started

    report(
        "instancia_vrp",
        f"Instancia VRP: {len(vehicles)} vehículos, demanda = nivel de llenado",
    )
    current_solution = _baseline_route(len(customers), dist_matrix, time_matrix)
    report(
        "aco",
        f"Ejecutando metaheurística ACO ({resolved_aco_ants} hormigas × {resolved_aco_iterations} iteraciones)",
        "progress",
    )
    aco_started = time.perf_counter()

    def aco_progress(iteration: int, total: int, best_cost_m: float, iteration_best_m: float) -> None:
        if reporter is not None:
            reporter.set_aco_progress(
                iteration,
                total,
                best_cost_m=best_cost_m,
                iteration_best_m=iteration_best_m,
            )

    optimized_solution = _aco_cvrp(
        len(customers),
        [c.demand_kg for c in customers],
        [v.capacity_kg for v in vehicles],
        dist_matrix,
        time_matrix,
        landfill_idx=landfill_idx,
        shift_budget_sec=shift_budget_sec,
        unload_sec=float(unload_seconds),
        service_secs=service_secs,
        aco_ants=resolved_aco_ants,
        aco_iterations=resolved_aco_iterations,
        aco_patience=ACO_PATIENCE,
        cancel_check=cancelled,
        on_iteration=aco_progress,
    )
    aco_seconds = time.perf_counter() - aco_started
    if optimized_solution.aco_stopped_early:
        report(
            "aco",
            (
                f"ACO detenido por convergencia tras {optimized_solution.aco_iterations_run} "
                f"iteraciones (paciencia={ACO_PATIENCE})"
            ),
            "info",
        )
    report("refinamiento_2opt", "Aplicando 2-opt local sobre rutas candidatas", "progress")

    served_indices = _served_customer_indices(optimized_solution, n_customers)
    served_codes = {customers[idx - 1].code for idx in served_indices}
    uncovered_point_codes = [customers[idx - 1].code for idx in optimized_solution.uncovered_customer_indices]

    kpis = _compute_kpis(
        current_solution,
        optimized_solution,
        customers,
        served_codes,
        vehicles,
        dist_matrix,
        time_matrix,
        operators_shortage=shortage_for_engine,
        workday_hours=duration_h,
        unload_seconds=unload_seconds,
        shift_budget_seconds=facilities.shift_budget_seconds,
        uncovered_point_codes=uncovered_point_codes,
    )

    computation_seconds = time.perf_counter() - computation_started
    engine_metrics = _build_engine_metrics(
        computation_seconds=computation_seconds,
        aco_seconds=aco_seconds,
        graph_seconds=graph_seconds,
        customer_count=len(customers),
        vehicle_count=len(vehicles),
        aco_ants=resolved_aco_ants,
        aco_iterations=resolved_aco_iterations,
        aco_iterations_run=optimized_solution.aco_iterations_run,
        aco_stopped_early=optimized_solution.aco_stopped_early,
        aco_patience=ACO_PATIENCE,
        matrix_cache_hit=matrix_cache_hit,
        matrix_cache_incremental=matrix_meta["matrixCacheIncremental"],
        matrix_patched_cells=matrix_meta["matrixPatchedCells"],
        matrix_parent_point_count=matrix_meta["matrixParentPointCount"],
        graph_load_source=graph_source,
        aco_parallel_workers=optimized_solution.aco_parallel_workers,
        aco_convergence=optimized_solution.aco_convergence,
    )
    kpis["engineMetrics"] = engine_metrics
    simulation_parameters["engineMetrics"] = engine_metrics

    opt_breakdown = kpis["durationBreakdown"]["optimized"]
    service_min = round(opt_breakdown["serviceHours"] * 60)
    crew_assign = opt_breakdown.get("crewAssignment", "6/6")
    report(
        "refinamiento_2opt",
        f"Tiempo en paradas: {service_min} min (dotación {crew_assign})",
        "info",
    )
    if shortage:
        per_stop = applied_crew_modifiers.get("serviceSecondsPerStop", BASE_SERVICE_SECONDS)
        report(
            "refinamiento_2opt",
            (
                f"Tiempo por punto con ausentismo: {per_stop // 60} min {per_stop % 60} s "
                f"({shortage} operario(s) de campo ausentes en el turno)"
            ),
            "info",
        )
    if uncovered_point_codes:
        report(
            "refinamiento_2opt",
            f"{len(uncovered_point_codes)} contenedor(es) no cubiertos por jornada o capacidad de flota",
            "warning",
        )
    landfill_trips = opt_breakdown.get("landfillTrips", 0)
    if landfill_trips:
        report(
            "refinamiento_2opt",
            f"Viajes al vertedero en rutas optimizadas: {landfill_trips}",
            "info",
        )
    if kpis["exceedsWorkday"]["optimized"]:
        report(
            "refinamiento_2opt",
            f"La duración optimizada supera la jornada de referencia ({duration_h or 8} h)",
            "warning",
        )

    current_geo = _merge_route_features(
        _routes_to_geojson(
            graph,
            current_solution,
            customers,
            dist_matrix,
            time_matrix,
            kind="current",
            label="Ruta actual (estática)",
            vehicles=vehicles,
            operators_shortage=shortage_for_engine,
            depot_lon=depot_lon,
            depot_lat=depot_lat,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
            unload_seconds=unload_seconds,
        )["features"],
        "current",
        "Ruta actual (estática)",
    )
    optimized_geo = _merge_route_features(
        _routes_to_geojson(
            graph,
            optimized_solution,
            customers,
            dist_matrix,
            time_matrix,
            kind="optimized",
            label="Ruta optimizada (IA)",
            vehicles=vehicles,
            operators_shortage=shortage_for_engine,
            depot_lon=depot_lon,
            depot_lat=depot_lat,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
            unload_seconds=unload_seconds,
        )["features"],
        "optimized",
        "Ruta optimizada (IA)",
    )

    routes_payload = {"current": current_geo, "optimized": optimized_geo}

    saving_pct = None
    if current_solution.distance_m > 0:
        saving_pct = round(
            (1 - optimized_solution.distance_m / current_solution.distance_m) * 100,
            1,
        )

    report("persistencia", "Persistiendo rutas optimizadas y waypoints en PostgreSQL", "success")

    planning_context = {
        "level": planning_level or ("operational" if contingency_meta else "simulation"),
        "weeklyPlanId": weekly_plan_id,
        "dailyPlanId": daily_plan_id,
        "operationDate": operation_date.isoformat() if operation_date else None,
        "autoDispatch": auto_dispatch,
    }

    simulation = Simulation(
        scenario_name=scenario_label,
        parameters_json=json.dumps(
            {
                "scenarioId": normalized,
                **scenario,
                "routesGeojson": routes_payload,
                "kpis": kpis,
                "engine": "aco_vrp_osmnx",
                "algorithm": "aco",
                "simulationParameters": simulation_parameters,
                "contingency": contingency_meta is not None,
                "planningContext": planning_context,
                **(contingency_meta or {}),
            },
            ensure_ascii=False,
        ),
        kpi_total_distance_historical=Decimal(str(round(current_solution.distance_m / 1000, 2))),
        kpi_total_distance_optimized=Decimal(str(round(optimized_solution.distance_m / 1000, 2))),
        kpi_saving_percentage=Decimal(str(saving_pct)) if saving_pct is not None else None,
    )
    db.add(simulation)
    db.flush()

    _persist_routes(
        db,
        simulation.id,
        vehicles,
        current_solution,
        optimized_solution,
        customers,
        routes_payload,
        dist_matrix,
        time_matrix,
        operators_shortage=shortage_for_engine,
        daily_plan_id=daily_plan_id,
        planning_level=planning_context["level"],
        unload_seconds=unload_seconds,
    )
    if daily_plan_id is not None:
        from app.services.planning_service import mark_daily_plan_optimized

        mark_daily_plan_optimized(db, daily_plan_id, simulation.id)
    dispatch = {"dispatchedRouteIds": [], "count": 0}
    if auto_dispatch:
        dispatch = dispatch_optimized_routes(
            db,
            preserve_active=contingency_meta is not None,
            daily_plan_id=daily_plan_id,
        )
    if auto_commit:
        db.commit()
        db.refresh(simulation)
    else:
        db.flush()
        db.refresh(simulation)

    report("persistencia", _format_computation_log_message(engine_metrics), "success")

    log_entries = _optimization_logs(scenario_label, len(customers), len(vehicles))
    if contingency_meta:
        log_entries = [
            {"message": f"Contingencia: avería en {contingency_meta.get('brokenVehicleCode', 'vehículo')}", "type": "warning"},
            {"message": f"Reasignando {contingency_meta.get('pendingPointsCount', 0)} puntos pendientes", "type": "info"},
            *log_entries,
        ]

    logs = [
        {
            "id": f"log-{simulation.id}-{index}",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
            "message": entry["message"],
            "type": entry["type"],
        }
        for index, entry in enumerate(log_entries)
    ]

    return {
        "simulationId": simulation.id,
        "scenarioId": normalized,
        "scenario": scenario,
        "kpis": kpis,
        "routes": routes_payload,
        "logs": logs,
        "dispatch": dispatch,
        "contingency": contingency_meta,
        "servedPointCodes": sorted(served_codes),
        "engineMetrics": engine_metrics,
    }
