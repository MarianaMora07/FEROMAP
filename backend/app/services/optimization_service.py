"""Motor de optimización VRP con metaheurística ACO sobre grafo OSMnx."""

from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable, Protocol

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Sector, Simulation, Vehicle
from app.domain.criticality import is_at_risk_before_next_visit, is_critical_now
from app.domain.waste_generation import generation_rate_kg_per_hour, hours_until_overflow
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
from app.domain.operational_clock import operational_departure_at
from app.domain.traffic_profile import (
    congestion_band_for_hour,
    is_traffic_weighted,
    normalize_departure_hour,
)
from app.services.next_visit_service import next_visits_by_point
from app.services.operational_facilities_service import resolve_operational_facilities
from app.services.zone_config_service import parish_for_sectors, sector_windows
from app.services.route_constraints import (
    build_applied_route_constraints,
    build_customer_time_windows,
    build_fill_level_heuristic_matrix,
)
from app.services.scenario_parameters import (
    apply_simulation_parameter_modifiers,
    build_applied_crew_modifiers,
    normalize_aco_ants,
    normalize_aco_iterations,
    normalize_duration_hours,
    normalize_rain_intensity,
    normalize_waste_level_pct,
)
from app.services.aco_parallel import (
    _default_distance_reference_m,
    _objective_cost,
    _rebalance_pass,
    resolve_aco_parallel_workers,
    run_ant_solutions,
    solution_overflow_kg,
    workload_statistics,
)
from app.services.admin_service import (
    get_algorithm_settings,
    resolve_operational_timezone,
)
from app.services.case_study_optimization import (
    case_study_simulation_payload,
    load_optimization_collection_points,
    prepare_case_study_engine_context,
    resolve_customer_demand,
    resolve_engine_parameters,
)
from app.services.distance_matrix_cache import resolve_distance_matrix
from app.services.graph_service import (
    DEPOT_LAT,
    DEPOT_LON,
    apply_scenario_weights,
    build_tour_coordinates,
    graph_load_source,
    load_road_graph,
    nearest_node,
    nearest_nodes,
    path_metrics_between_nodes,
)
from app.services.geo_service import fill_level_pct
from app.services.operations_service import dispatch_optimized_routes
from app.services.route_playback_service import PLAYBACK_ROUTE_COLORS
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


def resolve_sector_partition(
    requested: bool | None,
    *,
    auto_applies: bool,
    objective_requested: bool,
) -> tuple[bool, bool]:
    """Decide si se usa la partición sector→conductor (RNF-6/R-4, Fase 13).

    Devuelve ``(usar_partición, territorios_desactivados_por_multiobjetivo)``. La
    equidad y el makespan son métricas de **flota**, así que con el objetivo activo se
    prefiere el reparto global salvo que el llamador fuerce ``sector_partition=True``.
    """
    if requested is False:
        return False, False
    if requested is True:
        return True, False
    if objective_requested:
        return False, auto_applies
    return auto_applies, False


def cap_shift_budget_seconds(budget_seconds: int, requested_hours: int | None) -> int:
    """Presupuesto de turno efectivo: la jornada solicitada recorta el de la instalación."""
    if not requested_hours or requested_hours <= 0:
        return budget_seconds
    requested = int(requested_hours * 3600)
    if budget_seconds <= 0:
        return requested
    return min(budget_seconds, requested)


# Rango de los pesos del objetivo multiobjetivo (Fase 13, §9).
OBJECTIVE_WEIGHT_MAX = 10.0


def _normalize_objective_weight(value: float | None) -> float:
    """Acota un peso del objetivo a ``[0, 10]``; ``None`` → 0 (solo distancia)."""
    if value is None:
        return 0.0
    return max(0.0, min(OBJECTIVE_WEIGHT_MAX, float(value)))


def resolve_shift_hours(requested: int | None, algorithm_default: int | None) -> int | None:
    """Jornada de turno efectiva (h): la petición manda; si no, el default del algoritmo.

    Recortar el turno es lo que reparte la carga entre más vehículos: a igual demanda,
    una jornada más corta necesita más camiones. ``None`` = jornada de la instalación.
    """
    return normalize_duration_hours(requested if requested is not None else algorithm_default)


def resolve_min_active_vehicles(
    requested: int | None,
    *,
    available_customers: int,
    available_vehicles: int,
) -> tuple[int | None, str | None]:
    """Resuelve la restricción de flota mínima (RF-3) y su warning de degradación.

    Es infactible pedir más vehículos activos que puntos programados (cada vehículo
    activo necesita al menos una parada). En ese caso se degrada en vez de fallar.
    """
    if requested is None or requested <= 0:
        return None, None
    feasible = min(int(requested), max(0, available_customers), max(0, available_vehicles))
    if feasible <= 0:
        return None, (
            f"min_active_vehicles={requested} infactible "
            f"({available_customers} puntos, {available_vehicles} vehículos): "
            "restricción desactivada"
        )
    if feasible < requested:
        return feasible, (
            f"min_active_vehicles={requested} infactible "
            f"({available_customers} puntos, {available_vehicles} vehículos): "
            f"se degrada a {feasible} vehículo(s) activo(s)"
        )
    return feasible, None


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
    sector_id: int | None = None
    at_risk: bool = False


@dataclass
class VehicleUnit:
    vehicle_id: int
    driver_id: int
    capacity_kg: float
    fuel_rate: float
    ideal_operators: int
    assigned_operators: int
    code: str = ""


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
    # Vehículo real de cada ruta activa, en paralelo a ``vehicle_routes``. Es necesario
    # porque ``vehicle_routes`` solo trae las rutas con paradas: su posición no es el
    # índice de vehículo salvo que la solución venga paginada por vehículo.
    # ``None`` = "mismo orden" (soluciones armadas a mano; ver ``_route_vehicle_index``).
    vehicle_indices: list[int] | None = None


def _landfill_idx(n_customers: int) -> int:
    return landfill_node_index(n_customers)


def _active_vehicle_indices(routes: list[list[int]]) -> list[int]:
    """Índices de vehículo de las rutas con paradas (una entrada por vehículo de entrada)."""
    return [index for index, route in enumerate(routes) if len(route) > 2]


def _route_vehicle_index(solution: RouteSolution, route_position: int, vehicle_count: int) -> int:
    """Índice de vehículo dueño de la ruta activa que ocupa ``route_position``.

    Usa ``vehicle_indices`` cuando la solución lo trae y cae a la posición solo para
    soluciones armadas a mano (compatibilidad hacia atrás).
    """
    indices = solution.vehicle_indices
    if indices is not None and route_position < len(indices):
        return min(indices[route_position], vehicle_count - 1)
    return min(route_position, vehicle_count - 1)


def _is_collection_idx(idx: int, n_customers: int) -> bool:
    return 1 <= idx <= n_customers


def _route_collection_stop_count(route: list[int], n_customers: int) -> int:
    return sum(1 for idx in route if _is_collection_idx(idx, n_customers))


DEMO_ANCHOR_VEHICLE_CODE = "TR-01"


def _ensure_demo_anchor_vehicle_route(
    solution: RouteSolution,
    vehicles: list[VehicleUnit],
    n_customers: int,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    anchor_code: str = DEMO_ANCHOR_VEHICLE_CODE,
) -> RouteSolution:
    """Garantiza que el vehículo demo (TR-01) tenga al menos una parada tras optimizar."""
    anchor_idx = next(
        (index for index, unit in enumerate(vehicles) if unit.code == anchor_code),
        None,
    )
    if anchor_idx is None or n_customers < 1:
        return solution

    # Vista por vehículo (una entrada por vehículo) reconstruida desde las rutas activas y
    # su vehículo real: la posición en ``vehicle_routes`` no es el índice de vehículo.
    routes: list[list[int]] = [[0, 0] for _ in vehicles]
    for position, route in enumerate(solution.vehicle_routes):
        if len(route) <= 2:
            continue
        vehicle_idx = _route_vehicle_index(solution, position, len(vehicles))
        routes[vehicle_idx] = route[:]

    if _route_collection_stop_count(routes[anchor_idx], n_customers) > 0:
        return solution

    donor_idx = max(
        range(len(routes)),
        key=lambda index: (
            _route_collection_stop_count(routes[index], n_customers) if index != anchor_idx else -1
        ),
    )
    donor_stops = [idx for idx in routes[donor_idx] if _is_collection_idx(idx, n_customers)]
    if not donor_stops:
        return solution

    stolen = donor_stops[0]
    routes[donor_idx] = [idx for idx in routes[donor_idx] if idx != stolen]
    anchor_route = routes[anchor_idx]
    if anchor_route:
        routes[anchor_idx] = anchor_route[:1] + [stolen] + anchor_route[1:]
    else:
        routes[anchor_idx] = [0, stolen, 0]

    distance_m, duration_s = _evaluate_solution(routes, dist_matrix, time_matrix)
    return RouteSolution(
        vehicle_routes=routes,
        vehicle_indices=_active_vehicle_indices(routes),
        distance_m=distance_m,
        duration_s=duration_s,
        aco_iterations_run=solution.aco_iterations_run,
        aco_stopped_early=solution.aco_stopped_early,
        aco_parallel_workers=solution.aco_parallel_workers,
        aco_convergence=solution.aco_convergence,
        uncovered_customer_indices=solution.uncovered_customer_indices,
    )


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


def _kpi_distance_km(distance_m: float) -> Decimal | None:
    if not math.isfinite(distance_m) or distance_m < 0:
        return None
    return Decimal(str(round(distance_m / 1000, 2)))


def _kpi_saving_percentage(current_m: float, optimized_m: float) -> Decimal | None:
    if not math.isfinite(current_m) or not math.isfinite(optimized_m) or current_m <= 0:
        return None
    return Decimal(str(round((1 - optimized_m / current_m) * 100, 1)))


def _safe_distance_km(distance_m: float) -> float:
    if not math.isfinite(distance_m) or distance_m < 0:
        return 0.0
    return distance_m / 1000


_MAX_MATRIX_LEG_M = 80_000.0


def _matrix_max_leg_m(dist_matrix: list[list[float]]) -> float:
    max_leg = 0.0
    for i, row in enumerate(dist_matrix):
        for j, value in enumerate(row):
            if i == j or not isinstance(value, (int, float)):
                continue
            if math.isfinite(value) and value > max_leg:
                max_leg = float(value)
    return max_leg


def _distance_matrix_implausible(
    n_customers: int,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> bool:
    if _matrix_max_leg_m(dist_matrix) > _MAX_MATRIX_LEG_M:
        return True
    baseline = _baseline_route(n_customers, dist_matrix, time_matrix)
    probe_km = baseline.distance_m / 1000
    return probe_km > max(100.0, n_customers * 15.0)


def _coalesce_optimized_solution(optimized: RouteSolution, fallback: RouteSolution) -> RouteSolution:
    if math.isfinite(optimized.distance_m) and optimized.vehicle_routes:
        return optimized
    return RouteSolution(
        vehicle_routes=[route[:] for route in fallback.vehicle_routes],
        vehicle_indices=(
            fallback.vehicle_indices[:] if fallback.vehicle_indices is not None else None
        ),
        distance_m=fallback.distance_m,
        duration_s=fallback.duration_s,
        aco_iterations_run=optimized.aco_iterations_run,
        aco_stopped_early=optimized.aco_stopped_early,
        aco_parallel_workers=optimized.aco_parallel_workers,
        aco_convergence=optimized.aco_convergence,
        uncovered_customer_indices=optimized.uncovered_customer_indices,
    )


def build_sector_driver_map(db: Session) -> dict[int, int]:
    """Mapa sector_id → driver_id para sectores con conductor asignado."""
    rows = db.execute(
        select(Sector.id, Sector.driver_id).where(
            Sector.deleted_at.is_(None),
            Sector.driver_id.is_not(None),
        )
    ).all()
    return {int(sector_id): int(driver_id) for sector_id, driver_id in rows if driver_id is not None}


def resolve_sector_driver_map_for_optimization(
    customers: list[CustomerNode],
    vehicles: list[VehicleUnit],
    sector_driver_map: dict[int, int],
) -> dict[int, int]:
    """Completa sectores sin conductor con round-robin sobre conductores de la flota (en memoria)."""
    resolved = dict(sector_driver_map)
    if not vehicles:
        return resolved

    driver_ids: list[int] = []
    seen: set[int] = set()
    for unit in vehicles:
        if unit.driver_id not in seen:
            seen.add(unit.driver_id)
            driver_ids.append(unit.driver_id)
    if not driver_ids:
        return resolved

    sector_ids = sorted(
        {customer.sector_id for customer in customers if customer.sector_id is not None}
    )
    next_idx = 0
    for sector_id in sector_ids:
        if sector_id in resolved:
            continue
        resolved[sector_id] = driver_ids[next_idx % len(driver_ids)]
        next_idx += 1
    return resolved


def partition_customers_by_vehicle_sectors(
    customers: list[CustomerNode],
    vehicles: list[VehicleUnit],
    sector_driver_map: dict[int, int],
) -> tuple[list[list[int]], list[int]]:
    """Asigna índices 1-based de clientes a cada vehículo según sectores de su conductor.

    Si varios vehículos comparten conductor, el primero (por orden de flota) recibe los puntos.
    """
    driver_to_vehicle: dict[int, int] = {}
    for v_idx, vehicle in enumerate(vehicles):
        if vehicle.driver_id not in driver_to_vehicle:
            driver_to_vehicle[vehicle.driver_id] = v_idx

    assigned: list[list[int]] = [[] for _ in vehicles]
    unassigned: list[int] = []

    for c_idx, customer in enumerate(customers):
        global_idx = c_idx + 1
        sector_id = customer.sector_id
        if sector_id is None:
            unassigned.append(global_idx)
            continue
        driver_id = sector_driver_map.get(sector_id)
        if driver_id is None:
            unassigned.append(global_idx)
            continue
        v_idx = driver_to_vehicle.get(driver_id)
        if v_idx is None:
            unassigned.append(global_idx)
            continue
        assigned[v_idx].append(global_idx)

    return assigned, unassigned


def sector_territory_applies(
    customers: list[CustomerNode],
    explicit_sector_driver_map: dict[int, int],
) -> bool:
    """¿Conviene el ACO por territorio (sector→conductor)?

    Solo cuando existe asignación explícita en BD (sectors.driver_id) **y** todos los
    contenedores del día pertenecen a sectores con conductor asignado. Si el día mezcla
    sectores sin territorio, o se armó por zonas sin respetar conductores, es preferible
    el ACO global multi-flota: el algoritmo reparte libremente y nada queda "atrapado"
    en un camión por un reparto artificial (round-robin de la BD vacía).
    """
    if not explicit_sector_driver_map:
        return False
    if any(customer.sector_id is None for customer in customers):
        return False
    sector_ids = {customer.sector_id for customer in customers if customer.sector_id is not None}
    if not sector_ids:
        return False
    return sector_ids.issubset(explicit_sector_driver_map.keys())


def _extract_node_submatrix(matrix: list[list[float]], global_nodes: list[int]) -> list[list[float]]:
    return [[matrix[row][col] for col in global_nodes] for row in global_nodes]


def _baseline_routes_partitioned(
    assigned_by_vehicle: list[list[int]],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> RouteSolution:
    """Baseline multi-vehículo: orden fijo de código dentro de los puntos de cada conductor."""
    routes: list[list[int]] = []
    for customer_indices in assigned_by_vehicle:
        if not customer_indices:
            routes.append([0, 0])
            continue
        routes.append([0] + customer_indices + [0])
    distance_m, duration_s = _evaluate_solution(routes, dist_matrix, time_matrix)
    return RouteSolution(
        vehicle_routes=routes,
        distance_m=distance_m,
        duration_s=duration_s,
        vehicle_indices=_active_vehicle_indices(routes),
    )


def _remap_local_route_to_global(
    local_route: list[int],
    *,
    customer_globals: list[int],
    local_landfill: int,
    landfill_global: int,
) -> list[int]:
    remapped: list[int] = []
    for idx in local_route:
        if idx == 0:
            remapped.append(0)
        elif idx == local_landfill:
            remapped.append(landfill_global)
        elif 1 <= idx <= len(customer_globals):
            remapped.append(customer_globals[idx - 1])
    return remapped


def _merge_fleet_convergence_curve(
    per_vehicle_curves: list[list[dict[str, float | int]]],
) -> list[dict[str, float | int]]:
    """Agrega las curvas best-so-far locales (una por vehículo/sector) en la
    curva de convergencia de la flota.

    El ACO por sectores corre un `_aco_cvrp` por vehículo sobre SU subproblema, así
    que cada curva local es no creciente pero en km del sector (magnitudes distintas
    y no comparables entre vehículos). Concatenarlas producía saltos al cambiar de
    vehículo y hacía inválido comparar el primer punto con el último. Aquí se suman
    los mejores locales por número de iteración (congelando el último mejor conocido
    de los vehículos que ya se detuvieron por paciencia), de modo que la curva
    resultante es no creciente, está en km de flota y su último punto coincide con la
    distancia ACO final.
    """
    max_iterations = max((len(curve) for curve in per_vehicle_curves), default=0)
    merged: list[dict[str, float | int]] = []
    for iteration in range(1, max_iterations + 1):
        fleet_best_km = 0.0
        fleet_iteration_best_km = 0.0
        for curve in per_vehicle_curves:
            point = curve[min(iteration, len(curve)) - 1]
            fleet_best_km += float(point["bestDistanceKm"])
            fleet_iteration_best_km += float(point["iterationBestDistanceKm"])
        merged.append(
            {
                "iteration": iteration,
                "bestDistanceKm": round(fleet_best_km, 3),
                "iterationBestDistanceKm": round(fleet_iteration_best_km, 3),
            }
        )
    return merged


def _optimize_by_sector_assignment(
    customers: list[CustomerNode],
    vehicles: list[VehicleUnit],
    assigned_by_vehicle: list[list[int]],
    unassigned_indices: list[int],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    shift_budget_sec: float,
    unload_sec: float,
    service_secs: list[float],
    aco_ants: int,
    aco_iterations: int,
    aco_patience: int = ACO_PATIENCE,
    seed: int | None = None,
    cancel_check: Callable[[], bool] | None = None,
    on_iteration: Callable[[int, int, float, float], None] | None = None,
    priority_fill_level: bool = False,
    time_window_enabled: bool = False,
    zone_windows: dict[int, tuple[int, int]] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
    rho: float = ACO_RHO,
    pheromone_q: float = 1.0,
    pheromone_elitist: bool = False,
    two_opt_passes: int = 10,
    at_risk_multiplier: float = 1.50,
    critical_multiplier: float = 1.35,
    high_multiplier: float = 1.10,
    matrix_critical_factor: float = 0.70,
    matrix_high_factor: float = 0.90,
) -> RouteSolution:
    """Optimiza una ruta por vehículo solo con puntos de los sectores de su conductor."""
    n_customers = len(customers)
    # Semilla base del barrido; cada vehículo recibe una derivada para que su ACO local
    # sea reproducible sin compartir secuencia con los demás.
    base_seed = seed if seed is not None else 42
    landfill_global = _landfill_idx(n_customers)
    vehicle_routes: list[list[int]] = []
    uncovered: list[int] = list(unassigned_indices)
    total_distance = 0.0
    total_duration = 0.0
    iterations_run = 0
    stopped_early = False
    parallel_workers = 1
    per_vehicle_convergence: list[list[dict[str, float | int]]] = []

    vehicles_with_work = sum(1 for indices in assigned_by_vehicle if indices)
    progress_slots = max(1, vehicles_with_work)
    completed_slots = 0

    for v_idx, vehicle in enumerate(vehicles):
        customer_globals = assigned_by_vehicle[v_idx]
        if not customer_globals:
            vehicle_routes.append([0, 0])
            continue

        if cancel_check and cancel_check():
            raise OptimizationCancelledError()

        global_nodes = [0, *customer_globals, landfill_global]
        local_dist = _extract_node_submatrix(dist_matrix, global_nodes)
        local_time = _extract_node_submatrix(time_matrix, global_nodes)
        local_n = len(customer_globals)
        local_landfill = local_n + 1
        local_demands = [customers[idx - 1].demand_kg for idx in customer_globals]
        local_fill = [customers[idx - 1].fill_pct for idx in customer_globals]
        local_risk = [customers[idx - 1].at_risk for idx in customer_globals]
        local_deadline = (
            [overflow_deadline_sec[idx - 1] for idx in customer_globals]
            if overflow_deadline_sec is not None
            else None
        )
        local_rate = (
            [overflow_rate_kg_per_hour[idx - 1] for idx in customer_globals]
            if overflow_rate_kg_per_hour is not None
            else None
        )
        local_heuristic = build_fill_level_heuristic_matrix(
            local_dist,
            local_fill,
            enabled=priority_fill_level,
            critical_factor=matrix_critical_factor,
            high_factor=matrix_high_factor,
        )
        window_starts, window_ends = build_customer_time_windows(
            [customers[idx - 1].sector_id for idx in customer_globals],
            enabled=time_window_enabled,
            zone_windows=zone_windows,
        )

        def vehicle_progress(
            iteration: int,
            total: int,
            best_cost_m: float,
            iteration_best_m: float,
            *,
            _slot=completed_slots,
        ) -> None:
            if on_iteration is None:
                return
            # Escala el progreso ACO de este vehículo al progreso global de la flota.
            scaled_iter = _slot * total + iteration
            scaled_total = progress_slots * total
            on_iteration(scaled_iter, scaled_total, best_cost_m, iteration_best_m)

        local_solution = _aco_cvrp(
            local_n,
            local_demands,
            [vehicle.capacity_kg],
            local_dist,
            local_time,
            landfill_idx=local_landfill,
            shift_budget_sec=shift_budget_sec,
            unload_sec=unload_sec,
            service_secs=[service_secs[min(v_idx, len(service_secs) - 1)]],
            aco_ants=aco_ants,
            aco_iterations=aco_iterations,
            aco_patience=aco_patience,
            seed=base_seed + v_idx * 17,
            cancel_check=cancel_check,
            on_iteration=vehicle_progress if on_iteration else None,
            heuristic_matrix=local_heuristic,
            window_starts=window_starts,
            window_ends=window_ends,
            fill_pcts=local_fill,
            priority_fill_level=priority_fill_level,
            at_risk_flags=local_risk,
            overflow_deadline_sec=local_deadline,
            overflow_rate_kg_per_hour=local_rate,
            overflow_weight=overflow_weight,
            alpha=alpha,
            beta=beta,
            rho=rho,
            pheromone_q=pheromone_q,
            pheromone_elitist=pheromone_elitist,
            two_opt_passes=two_opt_passes,
            at_risk_multiplier=at_risk_multiplier,
            critical_multiplier=critical_multiplier,
            high_multiplier=high_multiplier,
        )

        if local_solution.vehicle_routes:
            global_route = _remap_local_route_to_global(
                local_solution.vehicle_routes[0],
                customer_globals=customer_globals,
                local_landfill=local_landfill,
                landfill_global=landfill_global,
            )
        else:
            global_route = [0, 0]
        vehicle_routes.append(global_route)

        for local_uncovered in local_solution.uncovered_customer_indices:
            if 1 <= local_uncovered <= len(customer_globals):
                uncovered.append(customer_globals[local_uncovered - 1])

        if math.isfinite(local_solution.distance_m):
            total_distance += local_solution.distance_m
        if math.isfinite(local_solution.duration_s):
            total_duration += local_solution.duration_s
        iterations_run = max(iterations_run, local_solution.aco_iterations_run)
        stopped_early = stopped_early or local_solution.aco_stopped_early
        parallel_workers = max(parallel_workers, local_solution.aco_parallel_workers)
        if local_solution.aco_convergence:
            per_vehicle_convergence.append(local_solution.aco_convergence)
        completed_slots += 1

    if not math.isfinite(total_distance) or total_distance <= 0:
        total_distance, total_duration = _evaluate_solution(vehicle_routes, dist_matrix, time_matrix)

    convergence = _merge_fleet_convergence_curve(per_vehicle_convergence)

    return RouteSolution(
        vehicle_routes=vehicle_routes,
        distance_m=total_distance,
        duration_s=total_duration,
        aco_iterations_run=iterations_run,
        aco_stopped_early=stopped_early,
        aco_parallel_workers=parallel_workers,
        aco_convergence=convergence,
        uncovered_customer_indices=sorted(set(uncovered)),
        vehicle_indices=_active_vehicle_indices(vehicle_routes),
    )


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
    traffic_weighted: bool = False,
    fallback_speed_kmh: float = AVG_SPEED_KMH,
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

    d_m, t_s = path_metrics_between_nodes(
        graph,
        graph_nodes[i],
        graph_nodes[j],
        by_time=traffic_weighted,
    )
    if not math.isfinite(d_m) or d_m <= 0:
        lon_i, lat_i = coords_for(i)
        lon_j, lat_j = coords_for(j)
        d_m = _haversine_m(lon_i, lat_i, lon_j, lat_j)
        speed_kmh = fallback_speed_kmh if fallback_speed_kmh and fallback_speed_kmh > 0 else AVG_SPEED_KMH
        t_s = d_m / 1000 / speed_kmh * 3600
    return d_m, t_s


def _path_metrics_for_node_sequence(
    graph: nx.MultiDiGraph,
    path: list[int],
    *,
    by_time: bool,
) -> tuple[float, float]:
    """Suma distancia (m) y tiempo (s) a lo largo de un camino ya calculado.

    Replica la agregación de ``path_metrics_between_nodes``: por cada tramo se
    elige la arista de menor ``weight`` entre paralelas y se acumula ``length``
    y ``travel_time`` (o ``weight`` si ``by_time``).
    """
    if len(path) < 2:
        return 0.0, 0.0
    dist_m = 0.0
    time_s = 0.0
    for u, v in zip(path[:-1], path[1:]):
        edge_data = graph.get_edge_data(u, v) or graph.get_edge_data(v, u)
        if not edge_data:
            continue
        edge = min(edge_data.values(), key=lambda d: d.get("weight", float("inf")))
        dist_m += float(edge.get("length", 0))
        if by_time:
            time_s += float(edge.get("weight", edge.get("travel_time", 0)))
        else:
            time_s += float(edge.get("travel_time", edge.get("weight", 0)))
    return dist_m, time_s


def _row_path_metrics_from_source(
    graph: nx.MultiDiGraph,
    undirected: nx.Graph,
    source: int,
    targets: list[int],
    *,
    by_time: bool,
) -> dict[int, tuple[float, float]]:
    """Distancia/tiempo desde ``source`` a cada ``target`` con UNA pasada de Dijkstra.

    Antes la matriz completa hacía un shortest-path por par (≈N²); esto calcula
    un árbol por origen (≈N pasadas), ~N veces menos trabajo en frío, con los
    mismos caminos mínimos (dirigido con respaldo no dirigido si no hay ruta).
    """
    weight_attr = "weight" if by_time else "length"
    try:
        directed_paths = nx.single_source_dijkstra_path(graph, source, weight=weight_attr)
    except (nx.NodeNotFound, nx.NetworkXError):
        directed_paths = {}

    undirected_paths: dict[int, list[int]] | None = None
    out: dict[int, tuple[float, float]] = {}
    for target in targets:
        if target == source:
            continue
        path = directed_paths.get(target)
        if path is None:
            if undirected_paths is None:
                try:
                    undirected_paths = nx.single_source_dijkstra_path(
                        undirected, source, weight=weight_attr
                    )
                except (nx.NodeNotFound, nx.NetworkXError):
                    undirected_paths = {}
            path = undirected_paths.get(target)
        out[target] = (
            (float("inf"), float("inf"))
            if path is None
            else _path_metrics_for_node_sequence(graph, path, by_time=by_time)
        )
    return out


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
    traffic_weighted: bool = False,
    fallback_speed_kmh: float = AVG_SPEED_KMH,
) -> tuple[list[list[float]], list[list[float]]]:
    """Matriz depósito + clientes + vertedero (N+2 nodos)."""
    speed_kmh = fallback_speed_kmh if fallback_speed_kmh and fallback_speed_kmh > 0 else AVG_SPEED_KMH
    landfill_idx = _landfill_idx(len(customers))
    n = landfill_idx + 1
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]

    if graph is not None:
        graph_nodes = [depot_node] + [c.graph_node for c in customers] + [landfill_node]
        undirected = graph.to_undirected()
        for i, source_node in enumerate(graph_nodes):
            row = _row_path_metrics_from_source(
                graph,
                undirected,
                source_node,
                graph_nodes,
                by_time=traffic_weighted,
            )
            for j, target_node in enumerate(graph_nodes):
                if i == j:
                    continue
                d_m, t_s = row.get(target_node, (float("inf"), float("inf")))
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
                    t_s = d_m / 1000 / speed_kmh * 3600
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
            time[i][j] = d_m / 1000 / speed_kmh * 3600
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
    # Fase 13.1 — métricas POR RUTA (horas de servicio por vehículo).
    fleet_slots = max(1, len(vehicles))
    vehicle_workload_hours = [0.0] * len(vehicles)
    route_hours: list[float] = []
    route_seconds: list[float] = []

    for v_idx, route in enumerate(solution.vehicle_routes):
        if len(route) <= 2:
            continue
        vehicle_idx = _route_vehicle_index(solution, v_idx, len(vehicles))
        vehicle = vehicles[vehicle_idx]
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
        if stops > 0:
            # Solo las rutas con recolección cuentan como vehículo activo.
            route_hours.append(route_total / 3600)
            route_seconds.append(route_total)
            vehicle_workload_hours[min(vehicle_idx, fleet_slots - 1)] = round(route_total / 3600, 2)
        assigned_effective = resolve_effective_assigned(
            vehicle.assigned_operators,
            ideal=vehicle.ideal_operators,
            operators_shortage=operators_shortage,
        )
        crew_assignments.append((assigned_effective, vehicle.ideal_operators))

    crew_assignment, crew_label = _fleet_crew_summary(crew_assignments)
    total_s = int(round(travel_s)) + service_s + unload_s
    # La jornada es **por vehículo**: la referencia de turno se compara con la ruta más cargada,
    # no con la suma de la flota (un día de 6 camiones no "dura" 64 h). Ver ADR-004.
    busiest_route_s = max(route_seconds) if route_seconds else 0.0
    shift_utilization = (
        min(100.0, busiest_route_s / shift_budget_seconds * 100.0)
        if shift_budget_seconds > 0
        else 0.0
    )
    mean_hours, std_hours, fairness = workload_statistics(route_hours)
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
        # Aditivo (Fase 13.1): perfil por ruta para los KPIs de flota/servicio/equidad.
        "active_vehicles": len(route_hours),
        "route_hours": route_hours,
        "vehicle_workload_hours": vehicle_workload_hours,
        "max_route_hours": round(busiest_route_s / 3600, 2),
        "workload_mean_hours": round(mean_hours, 2),
        "workload_std_hours": round(std_hours, 2),
        "fairness_index": round(fairness, 2),
    }


def _solution_overflow_kg(
    solution: RouteSolution,
    *,
    time_matrix: list[list[float]],
    landfill_idx: int,
    service_secs: list[float] | list[int],
    unload_sec: float,
    shift_budget_sec: float | None,
    window_starts: list[float] | None,
    deadline_sec: list[float | None] | None,
    rate_kg_per_hour: list[float] | None,
    vehicle_count: int,
) -> float:
    """Rebose proyectado de una ``RouteSolution``, en kg (KPI, no objetivo).

    ``RouteSolution`` solo expone las rutas activas; su vehículo real está en
    ``vehicle_indices``. Por eso se reconstruye la lista de tiempos de servicio con
    ``_route_vehicle_index`` antes de delegar en ``solution_overflow_kg``.
    """
    if deadline_sec is None or rate_kg_per_hour is None:
        return 0.0
    routes: list[list[int]] = []
    services: list[float] = []
    for position, route in enumerate(solution.vehicle_routes):
        if len(route) <= 2:
            continue
        vehicle_idx = _route_vehicle_index(solution, position, vehicle_count)
        routes.append(route)
        services.append(
            float(service_secs[min(vehicle_idx, len(service_secs) - 1)]) if service_secs else 0.0
        )
    return solution_overflow_kg(
        routes,
        time_matrix,
        landfill_idx=landfill_idx,
        services=services,
        unload_sec=unload_sec,
        shift_budget_sec=shift_budget_sec,
        deadline_sec=deadline_sec,
        rate_kg_per_hour=rate_kg_per_hour,
        window_starts=window_starts,
    )


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


def _solution_fuel_liters(
    solution: RouteSolution,
    vehicles: list[VehicleUnit],
    dist_matrix: list[list[float]],
) -> float:
    """Combustible total (L) según distancia por ruta × fuel_rate del vehículo (L/km)."""
    total = 0.0
    for v_idx, route in enumerate(solution.vehicle_routes):
        if len(route) <= 2:
            continue
        route_km = sum(dist_matrix[a][b] for a, b in zip(route, route[1:])) / 1000.0
        vehicle = vehicles[_route_vehicle_index(solution, v_idx, len(vehicles))]
        rate = float(vehicle.fuel_rate or FUEL_L_PER_KM)
        total += route_km * rate
    return total


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
    heuristic_matrix: list[list[float]] | None = None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
    fill_pcts: list[int] | None = None,
    priority_fill_level: bool = False,
    at_risk_flags: list[bool] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
    rho: float = ACO_RHO,
    pheromone_q: float = 1.0,
    pheromone_elitist: bool = False,
    two_opt_passes: int = 10,
    at_risk_multiplier: float = 1.50,
    critical_multiplier: float = 1.35,
    high_multiplier: float = 1.10,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    distance_reference_m: float | None = None,
    min_active_vehicles: int | None = None,
) -> RouteSolution:
    """Ant Colony Optimization para CVRP multi-viaje con vertedero y jornada."""
    parallel_workers = resolve_aco_parallel_workers(aco_ants)
    process_pool = None
    if parallel_workers > 1:
        from concurrent.futures import ProcessPoolExecutor

        process_pool = ProcessPoolExecutor(max_workers=parallel_workers)

    n_nodes = landfill_idx + 1
    # Referencia única de la corrida: normaliza el fitness y escala el depósito de
    # feromona, de modo que ρ y Q sigan siendo comparables entre modos.
    distance_reference = distance_reference_m
    if distance_reference is None or distance_reference <= 0:
        distance_reference = _default_distance_reference_m(dist_matrix)
    pick_matrix = heuristic_matrix if heuristic_matrix is not None else dist_matrix
    pheromone = [[1.0 / max(pick_matrix[i][j], 1.0) for j in range(n_nodes)] for i in range(n_nodes)]

    best_routes: list[list[int]] = []
    best_cost = float("inf")
    best_distance = float("inf")
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
            iteration_distance = float("inf")
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
                heuristic_matrix=heuristic_matrix,
                window_starts=window_starts,
                window_ends=window_ends,
                fill_pcts=fill_pcts,
                priority_fill_level=priority_fill_level,
                at_risk_flags=at_risk_flags,
                overflow_deadline_sec=overflow_deadline_sec,
                overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
                overflow_weight=overflow_weight,
                at_risk_multiplier=at_risk_multiplier,
                critical_multiplier=critical_multiplier,
                high_multiplier=high_multiplier,
                two_opt_passes=two_opt_passes,
                alpha=alpha,
                beta=beta,
                workload_balance_weight=workload_balance_weight,
                makespan_weight=makespan_weight,
                distance_reference_m=distance_reference,
                min_active_vehicles=min_active_vehicles,
            )
            for routes, cost, _dur, uncovered in ant_results:
                if cost < iteration_cost or (cost == iteration_cost and len(uncovered) < len(iteration_uncovered)):
                    iteration_cost = cost
                    iteration_distance, _ = _evaluate_solution(routes, dist_matrix, time_matrix)
                    iteration_best = [route[:] for route in routes]
                    iteration_uncovered = uncovered[:]

            if iteration_best and (
                iteration_cost < best_cost
                or (iteration_cost == best_cost and len(iteration_uncovered) < len(best_uncovered))
            ):
                best_cost = iteration_cost
                best_distance = iteration_distance
                best_routes = iteration_best
                best_uncovered = iteration_uncovered
                _, best_time = _evaluate_solution(best_routes, dist_matrix, time_matrix)
                improved = True

            record_best = best_distance if math.isfinite(best_distance) else iteration_distance
            record_iter = iteration_distance if math.isfinite(iteration_distance) else record_best
            convergence.append(
                {
                    "iteration": iterations_run,
                    "bestDistanceKm": round(record_best / 1000, 3),
                    "iterationBestDistanceKm": round(record_iter / 1000, 3),
                    # Costo combinado del objetivo (D6): distancia normalizada + equidad + makespan.
                    "bestCost": round(best_cost, 4) if math.isfinite(best_cost) else 0.0,
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
                    pheromone[i][j] *= 1 - rho
            if iteration_best:
                # ``iteration_cost`` es adimensional; se reescala por la referencia para
                # que Δτ viva en la escala de distancia previa y no explote.
                deposit = pheromone_q / max(iteration_cost * distance_reference, 1.0)
                for route in iteration_best:
                    for i, j in zip(route[:-1], route[1:]):
                        pheromone[i][j] += deposit
            # Variante elitista: refuerza además la mejor solución global.
            if pheromone_elitist and best_routes:
                elite_deposit = pheromone_q / max(best_cost * distance_reference, 1.0)
                for route in best_routes:
                    for i, j in zip(route[:-1], route[1:]):
                        pheromone[i][j] += elite_deposit
    finally:
        if process_pool is not None:
            process_pool.shutdown(wait=True)

    # Fase 13.2 — local search inter-ruta sobre la mejor solución (D3).
    objective_active = (
        workload_balance_weight > 0
        or makespan_weight > 0
        or (min_active_vehicles is not None and min_active_vehicles > 1)
    )
    if objective_active and best_routes:
        rebalanced = _rebalance_pass(
            best_routes,
            dist_matrix,
            time_matrix,
            capacities=capacities,
            demands=demands,
            landfill_idx=landfill_idx,
            service_secs=service_secs,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
            distance_reference_m=distance_reference,
            workload_balance_weight=workload_balance_weight,
            makespan_weight=makespan_weight,
            min_active_vehicles=min_active_vehicles,
            window_starts=window_starts,
            window_ends=window_ends,
            overflow_deadline_sec=overflow_deadline_sec,
            overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
            overflow_weight=overflow_weight,
        )
        rebalanced_cost = _objective_cost(
            rebalanced,
            dist_matrix,
            time_matrix,
            landfill_idx=landfill_idx,
            service_secs=service_secs,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
            distance_reference_m=distance_reference,
            workload_balance_weight=workload_balance_weight,
            makespan_weight=makespan_weight,
            min_active_vehicles=min_active_vehicles,
            window_starts=window_starts,
            overflow_deadline_sec=overflow_deadline_sec,
            overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
            overflow_weight=overflow_weight,
        )
        if rebalanced_cost < best_cost - 1e-9:
            best_routes = rebalanced
            best_cost = rebalanced_cost
            best_distance, best_time = _evaluate_solution(best_routes, dist_matrix, time_matrix)

    return RouteSolution(
        # ``best_routes`` lleva una entrada por vehículo (alineada con ``service_secs``);
        # hacia afuera solo se exponen las rutas con paradas, con su vehículo real.
        vehicle_routes=[route for route in best_routes if len(route) > 2],
        vehicle_indices=_active_vehicle_indices(best_routes),
        # ``best_distance`` está en metros (a diferencia de ``best_cost``, ya adimensional).
        distance_m=best_distance if math.isfinite(best_distance) else 0.0,
        duration_s=best_time,
        aco_iterations_run=iterations_run,
        aco_stopped_early=stopped_early,
        aco_parallel_workers=parallel_workers,
        aco_convergence=convergence,
        uncovered_customer_indices=best_uncovered,
    )


def _greedy_feasible_route(
    order: list[int],
    demands: list[float],
    capacity: float,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_sec: float,
    unload_sec: float,
    shift_budget_sec: float,
) -> tuple[list[int], list[int]]:
    """Ruta determinista en orden dado respetando capacidad y jornada.

    Cuando un punto no cabe por capacidad, el vehículo descarga en el vertedero y
    continúa (mismo modelo multi-viaje que el ACO). Los puntos que no caben dentro
    de la jornada quedan sin cubrir. Es el baseline "actual" con restricciones.
    """
    route: list[int] = [0]
    uncovered: list[int] = []
    load = 0.0
    elapsed = 0.0

    def leg(a: int, b: int) -> float:
        return float(time_matrix[a][b])

    for customer in order:
        demand = float(demands[customer - 1])
        previous = route[-1]
        direct_time = elapsed + service_sec + leg(previous, customer)
        if load + demand <= capacity and direct_time + leg(customer, 0) <= shift_budget_sec:
            route.append(customer)
            elapsed = direct_time
            load += demand
            continue
        # Descarga al vertedero y reintenta (mismo criterio de factibilidad que el ACO).
        reset_time = elapsed + leg(previous, landfill_idx) + unload_sec
        reset_ready = reset_time + service_sec + leg(landfill_idx, customer)
        if load + demand > capacity and reset_ready + leg(customer, 0) <= shift_budget_sec:
            route.append(landfill_idx)
            elapsed = reset_ready
            load = demand
            route.append(customer)
            continue
        uncovered.append(customer)

    route.append(0)
    return route, uncovered


def _baseline_factible_partitioned(
    assigned_by_vehicle: list[list[int]],
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    shift_budget_sec: float,
    unload_sec: float,
    service_secs: list[float],
) -> RouteSolution:
    """Baseline por sectores con restricciones reales (capacidad/jornada/vertedero)."""
    routes: list[list[int]] = []
    uncovered: list[int] = []
    for index, customer_indices in enumerate(assigned_by_vehicle):
        if not customer_indices:
            routes.append([0, 0])
            continue
        vehicle_service = service_secs[min(index, len(service_secs) - 1)] if service_secs else 0.0
        capacity = float(capacities[min(index, len(capacities) - 1)])
        route, route_uncovered = _greedy_feasible_route(
            customer_indices,
            demands,
            capacity,
            dist_matrix,
            time_matrix,
            landfill_idx=landfill_idx,
            service_sec=vehicle_service,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
        )
        routes.append(route)
        uncovered.extend(route_uncovered)
    distance_m, duration_s = _evaluate_solution(routes, dist_matrix, time_matrix)
    return RouteSolution(
        vehicle_routes=routes,
        distance_m=distance_m,
        duration_s=duration_s,
        uncovered_customer_indices=sorted(set(uncovered)),
        vehicle_indices=_active_vehicle_indices(routes),
    )


def _baseline_factible_global(
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
) -> RouteSolution:
    """Baseline global con restricciones: reparte en orden de código entre la flota."""
    order = list(range(1, n_customers + 1))
    routes: list[list[int]] = []
    uncovered: list[int] = []
    remaining = order[:]
    for index in range(len(capacities)):
        if not remaining:
            routes.append([0, 0])
            continue
        capacity = float(capacities[index])
        vehicle_service = service_secs[min(index, len(service_secs) - 1)] if service_secs else 0.0
        route, route_uncovered = _greedy_feasible_route(
            remaining,
            demands,
            capacity,
            dist_matrix,
            time_matrix,
            landfill_idx=landfill_idx,
            service_sec=vehicle_service,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
        )
        served = {node for node in route if 1 <= node <= n_customers}
        remaining = [customer for customer in remaining if customer not in served]
        routes.append(route)
        uncovered.extend(route_uncovered)
    uncovered = sorted(set(uncovered))
    distance_m, duration_s = _evaluate_solution(routes, dist_matrix, time_matrix)
    return RouteSolution(
        vehicle_routes=routes,
        distance_m=distance_m,
        duration_s=duration_s,
        uncovered_customer_indices=uncovered,
        vehicle_indices=_active_vehicle_indices(routes),
    )


def _baseline_route(
    n_customers: int,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
) -> RouteSolution:
    """Ruta actual: visita fija por orden de código (ineficiente)."""
    route = [0] + list(range(1, n_customers + 1)) + [0]
    d, t = _route_cost(route, dist_matrix, time_matrix)
    return RouteSolution(vehicle_routes=[route], distance_m=d, duration_s=t, vehicle_indices=[0])


def _critical_coverage_pct(customers: list[CustomerNode], served_codes: set[str]) -> int:
    critical = [c for c in customers if is_critical_now(c.fill_pct)]
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
        if len(route_indices) <= 2:
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
        vehicle_idx = _route_vehicle_index(solution, v_idx, len(vehicles)) if vehicles else v_idx
        vehicle = vehicles[vehicle_idx] if vehicles else None
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
        feature = _build_geojson_feature(
            coords,
            route_id=(
                f"route-{kind}" if vehicle_idx == 0 else f"route-{kind}-v{vehicle_idx + 1}"
            ),
            kind=kind,
            label=label if vehicle_idx == 0 else f"{label} — vehículo {vehicle_idx + 1}",
            distance_km=d / 1000,
            duration_min=int(total_s / 60),
            stops=stops,
        )
        # Aditivo: la identidad real del vehículo permite etiquetar correctamente las
        # rutas alternativas de contingencia (el ``label`` es genérico por diseño).
        vehicle_code = getattr(vehicle, "code", "") if vehicle is not None else ""
        if vehicle_code:
            feature["properties"]["vehicleCode"] = vehicle_code
        feature["properties"]["color"] = PLAYBACK_ROUTE_COLORS[v_idx % len(PLAYBACK_ROUTE_COLORS)]
        features.append(feature)
    return {"type": "FeatureCollection", "features": features}


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
    max_route_hours_target: float = 8.0,
) -> dict[str, Any]:
    n_customers = len(customers)
    cur_km = _safe_distance_km(current.distance_m)
    opt_km = _safe_distance_km(optimized.distance_m)
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
    cur_fuel = _solution_fuel_liters(current, vehicles, dist_matrix)
    opt_fuel = _solution_fuel_liters(optimized, vehicles, dist_matrix)
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
            # La jornada se mide por la ruta más cargada (por vehículo), no por la suma de la flota.
            "shiftUsedHours": round(metrics["max_route_hours"], 2),
            "shiftUtilizationPct": metrics["shift_utilization_pct"],
            "uncoveredPoints": len(uncovered),
            "crewLabel": metrics["crew_label"],
            "crewAssignment": metrics["crew_assignment"],
            "stopCount": metrics["stop_count"],
        }

    active_routes = [route for route in optimized.vehicle_routes if len(route) > 2]
    vehicle_count = max(1, len(active_routes))

    # Fase 13.1 — KPIs de flota, duración y equidad (aditivos).
    active_vehicles = int(opt_metrics["active_vehicles"])
    assignable_vehicles = max(1, len(vehicles))
    fleet_utilization = round(active_vehicles / assignable_vehicles * 100, 1)
    route_hours = list(opt_metrics["route_hours"])
    target_hours = max_route_hours_target if max_route_hours_target and max_route_hours_target > 0 else workday_h
    finish_under_target = (
        round(sum(1 for value in route_hours if value <= target_hours) / len(route_hours) * 100, 1)
        if route_hours
        else 0.0
    )
    max_route_hours = float(opt_metrics["max_route_hours"])
    shift_hours = shift_budget_seconds / 3600 if shift_budget_seconds > 0 else workday_h
    shift_slack = round(shift_hours - max_route_hours, 2)

    saving_pct_val = round((1 - opt_km / cur_km) * 100, 1) if cur_km > 0 else 0.0
    critical_pct_opt = _critical_coverage_pct(customers, served_codes)
    iec = round((saving_pct_val * coverage_pct * critical_pct_opt) / 10000, 2)

    return {
        "distanceKm": {"current": round(cur_km, 1), "optimized": round(opt_km, 1)},
        "durationHours": {"current": round(cur_h, 2), "optimized": round(opt_h, 2)},
        "durationBreakdown": {
            "current": _breakdown(cur_metrics),
            "optimized": _breakdown(opt_metrics),
        },
        "exceedsWorkday": {
            # Por vehículo: que un camión no quepa en el turno, no que la flota sume más horas.
            "current": float(cur_metrics["max_route_hours"]) > workday_h,
            "optimized": max_route_hours > workday_h,
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
        "iec": iec,
        "savingPct": saving_pct_val,
        # Fase 13.1 — uso de flota, tiempo de servicio y equidad (Fase 13, §5.1).
        "activeVehicles": active_vehicles,
        "fleetUtilizationPct": fleet_utilization,
        "vehicleWorkloadHours": opt_metrics["vehicle_workload_hours"],
        "maxRouteHours": max_route_hours,
        "shiftSlackHours": shift_slack,
        "finishUnderTargetPct": finish_under_target,
        "maxRouteHoursTarget": round(target_hours, 2),
        "workloadStdHours": opt_metrics["workload_std_hours"],
        "fairnessIndex": opt_metrics["fairness_index"],
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
    two_opt_passes: int = 10,
    pheromone_elitist: bool = False,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    min_active_vehicles: int | None = None,
    max_route_hours_target: float = 8.0,
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
        "twoOptPasses": two_opt_passes,
        "pheromoneElitist": pheromone_elitist,
        "matrixCacheHit": matrix_cache_hit,
        "matrixCacheIncremental": matrix_cache_incremental,
        "matrixPatchedCells": matrix_patched_cells,
        "matrixParentPointCount": matrix_parent_point_count,
        "graphLoadSource": graph_load_source,
        "acoParallelWorkers": aco_parallel_workers,
        "acoConvergence": aco_convergence,
        "customers": customer_count,
        "vehicles": vehicle_count,
        # Fase 13 — parámetros del objetivo multiobjetivo (trazabilidad RNF-5).
        "workloadBalanceWeight": workload_balance_weight,
        "makespanWeight": makespan_weight,
        "minActiveVehicles": min_active_vehicles,
        "maxRouteHoursTarget": max_route_hours_target,
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
    fleet_limit: int | None = None,
    fleet_by_type: dict[str, int] | None = None,
) -> list[VehicleUnit]:
    """Arma la flota VRP: todos los asignables con conductor; fleet_limit es tope opcional.

    Si ``fleet_by_type`` (p. ej. {"Compactadora": 3}) está definido, por cada tipo se
    toman las primeras N unidades ordenadas por id y el resto de la flota no participa.
    """
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
    if fleet_by_type:
        limited: list[Vehicle] = []
        used: dict[str, int] = {}
        for vehicle in vehicles_db:
            vtype = vehicle.vehicle_type
            if vtype not in fleet_by_type:
                continue
            if used.get(vtype, 0) >= fleet_by_type[vtype]:
                continue
            limited.append(vehicle)
            used[vtype] = used.get(vtype, 0) + 1
        vehicles_db = limited

    active_routes = get_active_routes_by_vehicle_id(db)
    units: list[VehicleUnit] = []
    cap = fleet_limit if fleet_limit is not None and fleet_limit > 0 else None
    for vehicle in vehicles_db:
        if cap is not None and len(units) >= cap:
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
                fuel_rate=float(vehicle.fuel_consumption_rate or FUEL_L_PER_KM),
                ideal_operators=vehicle.ideal_operators_count or DEFAULT_IDEAL_OPERATORS,
                assigned_operators=resolve_vehicle_assigned_operators(vehicle),
                code=vehicle.code,
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


def _supersede_daily_plan_optimized_routes(db: Session, daily_plan_id: int) -> int:
    """Marca como superseded las rutas optimizadas previas del plan (evita acumular TR duplicados)."""
    previous = db.scalars(
        select(OptimizedRoute).where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status.in_(("pending", "completed")),
        )
    ).all()
    for route in previous:
        route.status = "superseded"
    if previous:
        db.flush()
    return len(previous)


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
    departure_at: datetime | None = None,
) -> None:
    """Guarda rutas y waypoints en BD."""
    if daily_plan_id is not None:
        superseded = _supersede_daily_plan_optimized_routes(db, daily_plan_id)
        if superseded:
            logger.info(
                "Plan diario %s: %s ruta(s) optimizada(s) previas marcadas como superseded",
                daily_plan_id,
                superseded,
            )

    n_customers = len(customers)
    landfill_idx = _landfill_idx(n_customers)
    for kind, solution in [("current", current_solution), ("optimized", optimized_solution)]:
        for v_idx, route_indices in enumerate(solution.vehicle_routes):
            if len(route_indices) <= 2:
                continue
            vehicle = vehicles[_route_vehicle_index(solution, v_idx, len(vehicles))]
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
            # Fase 13.5 — ETA por parada: viaje + servicio + descargas desde la salida.
            elapsed_s = 0.0
            previous = route_indices[0] if route_indices else 0
            assigned_effective = resolve_effective_assigned(
                vehicle.assigned_operators,
                ideal=vehicle.ideal_operators,
                operators_shortage=operators_shortage,
            )
            service_per_stop = service_time_seconds_per_stop(
                assigned_effective, ideal=vehicle.ideal_operators
            )
            for idx in route_indices:
                if idx == 0:
                    continue
                seq += 1
                elapsed_s += time_matrix[previous][idx]
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
                    elapsed_s += unload_seconds
                    previous = idx
                    continue
                if not _is_collection_idx(idx, n_customers):
                    previous = idx
                    continue
                customer = customers[idx - 1]
                estimated_arrival = (
                    departure_at + timedelta(seconds=elapsed_s)
                    if departure_at is not None
                    else None
                )
                db.add(
                    RouteWaypoint(
                        route_id=db_route.id,
                        collection_point_id=customer.point_id,
                        waypoint_type="collection",
                        sequence_order=seq,
                        status="pending",
                        collected_weight_kg=Decimal(str(round(customer.demand_kg, 2))),
                        estimated_arrival_at=estimated_arrival,
                    )
                )
                elapsed_s += service_per_stop
                previous = idx


def run_optimization_engine(
    db: Session,
    scenario_id: str | None = None,
    *,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    estimated_duration_hours: int | None = None,
    operators_shortage: int | None = None,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
    aco_alpha: float | None = None,
    aco_beta: float | None = None,
    aco_rho: float | None = None,
    pheromone_q: float | None = None,
    aco_patience: int | None = None,
    two_opt_passes: int | None = None,
    pheromone_elitist: bool | None = None,
    priority_fill_level: bool | None = None,
    time_window_enabled: bool | None = None,
    kpi_view: str | None = None,
    departure_hour: int | None = None,
    collection_point_ids: list[int] | None = None,
    case_study_id: int | None = None,
    exclude_vehicle_ids: list[int] | None = None,
    contingency_meta: dict[str, Any] | None = None,
    auto_dispatch: bool = False,
    auto_commit: bool = True,
    persist: bool = True,
    reporter: OptimizationProgressReporter | None = None,
    operation_date: date | None = None,
    daily_plan_id: int | None = None,
    weekly_plan_id: int | None = None,
    planning_level: str | None = None,
    fleet_limit: int | None = None,
    fleet_by_type: dict[str, int] | None = None,
    sector_partition: bool | None = None,
    include_per_vehicle_routes: bool = False,
    seed: int | None = None,
    workload_balance_weight: float | None = None,
    makespan_weight: float | None = None,
    min_active_vehicles: int | None = None,
    max_route_hours_target: float | None = None,
) -> dict[str, Any]:
    """Ejecuta el motor real de optimización y persiste resultados.

    Con ``persist=False`` omite el ensamblado de GeoJSON y la escritura de la simulación
    (rutas y waypoints) en la BD: pensado para consumidores que solo leen los KPIs
    (validación estadística, benchmark, barridos). Evita INSERTs que luego se revierten.
    """
    computation_started = time.perf_counter()
    aco_seconds = 0.0
    graph_seconds = 0.0

    def report(phase: str, message: str, log_type: str = "info") -> None:
        if reporter is not None:
            reporter.advance(phase, message, log_type)

    def cancelled() -> bool:
        return reporter.cancelled() if reporter is not None else False

    report("preparando", "Preparando escenario y parámetros de simulación")

    case_context = None
    if case_study_id is not None:
        case_context = prepare_case_study_engine_context(
            db,
            case_study_id=case_study_id,
            collection_point_ids=collection_point_ids,
        )
        report(
            "preparando",
            f"Caso de estudio «{case_context.study.code}» — {len(case_context.resolved_point_ids)} puntos",
        )

    resolved_params = resolve_engine_parameters(
        case_context.study if case_context else None,
        scenario_id=scenario_id,
        operators_shortage=operators_shortage,
        aco_ants=aco_ants,
        aco_iterations=aco_iterations,
        priority_fill_level=priority_fill_level,
        time_window_enabled=time_window_enabled,
        estimated_duration_hours=estimated_duration_hours,
        rain_intensity=rain_intensity,
        waste_level_pct=waste_level_pct,
        workload_balance_weight=workload_balance_weight,
        makespan_weight=makespan_weight,
        min_active_vehicles=min_active_vehicles,
        max_route_hours_target=max_route_hours_target,
    )

    normalized = normalize_scenario_id(resolved_params.scenario_id)
    scenarios = {row["id"]: row for row in load_seed("scenarios.json")}
    if normalized not in scenarios:
        raise ValueError(f"Escenario desconocido: {resolved_params.scenario_id}")

    scenario = scenarios[normalized]
    scenario_label = scenario["label"]
    if case_context is not None:
        scenario_label = f"{case_context.study.name} — {scenario_label}"
    if contingency_meta:
        scenario_label = f"{scenario_label} — recálculo por avería"

    report("preparando", f"Iniciando optimización — escenario «{scenario['label']}»")
    traffic_mult = float(scenario.get("trafficMultiplier", 1))
    fill_boost = float(scenario.get("fillLevelBoost", 0))

    rain = normalize_rain_intensity(resolved_params.rain_intensity)
    waste = normalize_waste_level_pct(resolved_params.waste_level_pct)
    shortage = normalize_operators_shortage(resolved_params.operators_shortage)
    # Parámetros del algoritmo configurables por el planificador (BD) que actúan como
    # valores por defecto cuando la corrida no los especifica.
    algorithm_settings = get_algorithm_settings(db)
    # Fase 13 — jornada de turno: la corrida manda; si no, el default del algoritmo.
    duration_h = resolve_shift_hours(
        resolved_params.estimated_duration_hours,
        algorithm_settings.default_shift_hours,
    )
    resolved_aco_ants = normalize_aco_ants(
        resolved_params.aco_ants
        if resolved_params.aco_ants is not None
        else algorithm_settings.aco_ants
    )
    resolved_aco_iterations = normalize_aco_iterations(
        resolved_params.aco_iterations
        if resolved_params.aco_iterations is not None
        else algorithm_settings.aco_iterations
    )
    aco_patience = max(
        0, int(aco_patience if aco_patience is not None else algorithm_settings.aco_patience)
    )
    overflow_weight = float(algorithm_settings.overflow_penalty_weight)
    # Fase 13 — hiperparámetros del ACO (request > admin). Expuestos por corrida para que
    # el barrido de sensibilidad pueda variar α/β/ρ/Q y quede registrado en la evidencia.
    resolved_aco_alpha = float(aco_alpha if aco_alpha is not None else algorithm_settings.aco_alpha)
    resolved_aco_beta = float(aco_beta if aco_beta is not None else algorithm_settings.aco_beta)
    resolved_aco_rho = float(aco_rho if aco_rho is not None else algorithm_settings.aco_rho)
    resolved_pheromone_q = float(
        pheromone_q if pheromone_q is not None else algorithm_settings.pheromone_q
    )
    # Regla de parada, local search y variante elitista: también por corrida (request > admin),
    # con el mismo patrón que α/β/ρ/Q. El protocolo de calibración los necesita como **factores
    # declarados**: heredarlos de Administración era lo que confundía el recorte por paciencia
    # con una diferencia real entre configuraciones.
    pheromone_elitist = bool(
        pheromone_elitist if pheromone_elitist is not None else algorithm_settings.pheromone_elitist
    )
    two_opt_passes = max(
        1,
        int(two_opt_passes if two_opt_passes is not None else algorithm_settings.two_opt_passes),
    )
    at_risk_multiplier = float(algorithm_settings.heuristic_at_risk_multiplier)
    critical_multiplier = float(algorithm_settings.heuristic_critical_multiplier)
    high_multiplier = float(algorithm_settings.heuristic_high_multiplier)
    matrix_critical_factor = float(algorithm_settings.matrix_critical_factor)
    matrix_high_factor = float(algorithm_settings.matrix_high_factor)
    resolved_priority_fill_level = (
        bool(resolved_params.priority_fill_level)
        if resolved_params.priority_fill_level is not None
        else False
    )
    resolved_time_window_enabled = (
        bool(resolved_params.time_window_enabled)
        if resolved_params.time_window_enabled is not None
        else False
    )
    # Fase 13 — pesos del objetivo multiobjetivo (request > caso > admin).
    resolved_workload_balance_weight = _normalize_objective_weight(
        resolved_params.workload_balance_weight
        if resolved_params.workload_balance_weight is not None
        else algorithm_settings.workload_balance_weight
    )
    resolved_makespan_weight = _normalize_objective_weight(
        resolved_params.makespan_weight
        if resolved_params.makespan_weight is not None
        else algorithm_settings.makespan_weight
    )
    resolved_max_route_hours_target = float(
        resolved_params.max_route_hours_target
        if resolved_params.max_route_hours_target is not None
        else algorithm_settings.max_route_hours_target
    )
    requested_min_active_vehicles = (
        resolved_params.min_active_vehicles
        if resolved_params.min_active_vehicles is not None
        else algorithm_settings.min_active_vehicles
    )
    # Semilla del ACO expuesta desde el request/job (Fase 13) para que los barridos de
    # robustez sean reproducibles. Sin semilla se conserva el valor histórico (42).
    resolved_seed = seed if seed is not None else 42
    # ¿La corrida pide el objetivo multiobjetivo? (afecta el reparto de territorios, R-4)
    objective_requested = (
        resolved_workload_balance_weight > 0
        or resolved_makespan_weight > 0
        or (requested_min_active_vehicles is not None and requested_min_active_vehicles > 0)
    )
    resolved_kpi_view = kpi_view if kpi_view in {"distance", "time", "co2"} else "distance"
    traffic_mult, fill_boost, applied_modifiers = apply_simulation_parameter_modifiers(
        normalized,
        traffic_mult,
        fill_boost,
        rain_intensity=rain,
        waste_level_pct=waste,
    )
    applied_crew_modifiers = build_applied_crew_modifiers(shortage)
    resolved_departure_hour = normalize_departure_hour(departure_hour)
    departure_band = (
        congestion_band_for_hour(resolved_departure_hour)
        if resolved_departure_hour is not None
        else None
    )
    band_factor = departure_band.factor if departure_band is not None else 1.0
    traffic_weighted = is_traffic_weighted(traffic_mult, band_factor)
    simulation_parameters = {
        "rainIntensity": rain,
        "wasteLevelPct": waste,
        "estimatedDurationHours": duration_h,
        "operatorsShortage": shortage or 0,
        "departureHour": resolved_departure_hour,
        "trafficBand": departure_band.display_label() if departure_band is not None else None,
        "trafficBandFactor": round(band_factor, 4),
        "acoAnts": resolved_aco_ants,
        "acoIterations": resolved_aco_iterations,
        "appliedModifiers": applied_modifiers,
        "appliedCrewModifiers": applied_crew_modifiers,
        "appliedRouteConstraints": build_applied_route_constraints(
            priority_fill_level=resolved_priority_fill_level,
            time_window_enabled=resolved_time_window_enabled,
            kpi_view=resolved_kpi_view,
            time_window_model="zone",
        ),
    }
    if case_context is not None:
        simulation_parameters["caseStudy"] = case_study_simulation_payload(case_context)

    if resolved_priority_fill_level:
        report(
            "preparando",
            "Prioridad por llenado activa — contenedores ≥80% más atractivos para el ACO",
            "info",
        )
    if resolved_time_window_enabled:
        report(
            "preparando",
            "Ventanas horarias por sector activas (mañana 06–12 h / tarde 12–18 h)",
            "info",
        )

    if shortage:
        report(
            "preparando",
            (
                f"Ausentismo del turno: {shortage} operario(s) de campo ausentes. "
                "El conductor permanece en cada camión; se aplica antes del cálculo de duración."
            ),
            "warning",
        )

    if departure_band is not None:
        report(
            "preparando",
            f"Franja horaria de salida: {departure_band.display_label()}",
            "info",
        )
    if traffic_weighted:
        report(
            "preparando",
            "Tráfico activo — enrutando por tiempo ponderado (congestión modifica rutas y duraciones)",
            "info",
        )

    report("grafo_vial", f"Cargando grafo OSMnx — red vial de Unare")
    graph_started = time.perf_counter()
    base_graph = load_road_graph()
    graph_source = graph_load_source()
    graph = apply_scenario_weights(
        base_graph.copy(),
        traffic_multiplier=traffic_mult,
        scenario_id=normalized,
        band_factor=band_factor,
    )

    if case_context is not None:
        allowed_ids = case_context.resolved_point_ids
        memberships = case_context.memberships_by_point_id
    elif collection_point_ids is not None:
        allowed_ids = sorted(set(collection_point_ids))
        memberships = {}
    else:
        allowed_ids = None
        memberships = {}

    points = load_optimization_collection_points(db, allowed_ids=allowed_ids)

    report(
        "grafo_vial",
        f"Cargando {len(points)} puntos de recolección activos",
    )

    customers: list[CustomerNode] = []
    # Misma "próxima visita" que el KPI y las alertas (plan aprobado > agenda).
    visits = next_visits_by_point(db)

    # Nodos del grafo para los 300 puntos en una sola pasada (OSMnx reconstruye el índice
    # espacial por llamada; resolver punto a punto era el mayor costo de la fase de grafo).
    graph_nodes = nearest_nodes(
        graph,
        [float(point.longitude) for point in points],
        [float(point.latitude) for point in points],
    )

    overflow_deadlines: list[float | None] = []
    overflow_rates: list[float] = []
    for index, point in enumerate(points):
        membership = memberships.get(point.id)
        demand, boosted_pct = resolve_customer_demand(
            point,
            membership,
            fill_boost=fill_boost,
        )
        visit = visits.get(point.id)
        at_risk = visit is not None and is_at_risk_before_next_visit(
            point, next_visit_hours=visit.hours
        )
        hours_to_overflow = hours_until_overflow(point)
        overflow_deadlines.append(
            None if hours_to_overflow is None else hours_to_overflow * 3600.0
        )
        overflow_rates.append(generation_rate_kg_per_hour(point))
        customers.append(
            CustomerNode(
                point_id=point.id,
                code=point.code,
                graph_node=graph_nodes[index],
                demand_kg=demand,
                fill_pct=boosted_pct,
                lon=float(point.longitude),
                lat=float(point.latitude),
                sector_id=point.sector_id,
                at_risk=at_risk,
            )
        )

    excluded_ids = set(exclude_vehicle_ids or [])
    vehicles = build_optimization_vehicle_units(
        db,
        exclude_vehicle_ids=excluded_ids,
        contingency=contingency_meta is not None,
        fleet_limit=fleet_limit,
        fleet_by_type=fleet_by_type,
    )
    if not vehicles:
        raise RuntimeError("No hay vehículos con conductor asignado para la optimización")

    vehicles = _resolve_fleet_crew(vehicles, shortage)
    shortage_for_engine = None

    # Configuración por zona (F8): depósito/vertedero y ventanas horarias de la
    # parroquia de los clientes (si todos comparten una).
    sector_ids = [customer.sector_id for customer in customers]
    parish_id = parish_for_sectors(db, sector_ids)
    zone_windows = sector_windows(db, sector_ids) if resolved_time_window_enabled else {}

    facilities = resolve_operational_facilities(db, parish_id=parish_id)
    depot_lon, depot_lat = facilities.depot
    landfill_lon, landfill_lat = facilities.landfill
    unload_seconds = facilities.unload_seconds
    shift_budget_sec = float(facilities.shift_budget_seconds)
    if duration_h is not None and duration_h > 0:
        # Jornada de referencia solicitada (UI): recorta el presupuesto de turno
        # para que el solver corte rutas antes (Tarea 7).
        shift_budget_sec = float(cap_shift_budget_seconds(int(shift_budget_sec), duration_h))
    fallback_speed_kmh = float(facilities.default_speed_kmh or AVG_SPEED_KMH)
    landfill_node = nearest_node(graph, landfill_lon, landfill_lat)
    n_customers = len(customers)
    if duration_h is not None and duration_h > 0:
        simulation_parameters["effectiveShiftBudgetHours"] = round(shift_budget_sec / 3600, 1)
    landfill_idx = _landfill_idx(n_customers)
    service_secs = [
        compute_service_time_sec(vehicle, shortage_for_engine) for vehicle in vehicles
    ]

    # Fase 13.3 — restricción de flota mínima: degradar con warning si es infactible.
    effective_min_active_vehicles, min_active_warning = resolve_min_active_vehicles(
        requested_min_active_vehicles,
        available_customers=n_customers,
        available_vehicles=len(vehicles),
    )
    if min_active_warning:
        report("instancia_vrp", min_active_warning, "warning")

    if (
        resolved_workload_balance_weight > 0
        or resolved_makespan_weight > 0
        or effective_min_active_vehicles is not None
    ):
        report(
            "instancia_vrp",
            (
                "Objetivo multiobjetivo activo — "
                f"equidad λ_b={resolved_workload_balance_weight:g}, "
                f"makespan λ_t={resolved_makespan_weight:g}, "
                f"mín. vehículos={effective_min_active_vehicles if effective_min_active_vehicles is not None else '—'}"
            ),
            "info",
        )

    # Fase 13.5 — salida de la flota en la zona horaria operativa (reloj local, no UTC).
    departure_at = operational_departure_at(
        operation_date,
        facilities.work_start,
        tz=resolve_operational_timezone(db),
    )

    simulation_parameters["multiObjective"] = {
        "workloadBalanceWeight": resolved_workload_balance_weight,
        "makespanWeight": resolved_makespan_weight,
        "minActiveVehicles": effective_min_active_vehicles,
        "minActiveVehiclesRequested": requested_min_active_vehicles,
        "maxRouteHoursTarget": resolved_max_route_hours_target,
        "overflowWeight": overflow_weight,
        "departureAt": departure_at.isoformat(),
    }
    # Trazabilidad del barrido de sensibilidad: hiperparámetros efectivos de la corrida.
    simulation_parameters["acoHyperparameters"] = {
        "alpha": resolved_aco_alpha,
        "beta": resolved_aco_beta,
        "rho": resolved_aco_rho,
        "pheromoneQ": resolved_pheromone_q,
    }

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
            traffic_weighted=traffic_weighted,
            fallback_speed_kmh=fallback_speed_kmh,
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
            traffic_weighted=traffic_weighted,
            fallback_speed_kmh=fallback_speed_kmh,
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
        traffic_band_factor=band_factor,
        time_model="weighted" if traffic_weighted else "length",
    )
    if _distance_matrix_implausible(n_customers, dist_matrix, time_matrix):
        report(
            "matriz_costos",
            "Matriz vial incoherente; recalculando con distancias Haversine entre coordenadas",
            "warning",
        )
        dist_matrix, time_matrix = _build_distance_matrix(
            None,
            depot_node,
            customers,
            depot_lon=depot_lon,
            depot_lat=depot_lat,
            landfill_node=landfill_node,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
            fallback_speed_kmh=fallback_speed_kmh,
        )
        matrix_meta = {**matrix_meta, "matrixCacheHit": False, "matrixFallback": "haversine"}
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

    # Territorio sector→conductor: solo se respeta si existe asignación explícita en BD
    # y cubre todos los puntos del día. En caso contrario (BD sin territorios, día armado
    # por zonas desde el Plan semanal o mezcla) se usa el ACO global multi-flota, que
    # reparte los contenedores libremente entre la flota.
    explicit_sector_driver_map = build_sector_driver_map(db)
    auto_sector_partition = sector_territory_applies(customers, explicit_sector_driver_map)
    use_sector_partition, partition_disabled_by_objective = resolve_sector_partition(
        sector_partition,
        auto_applies=auto_sector_partition,
        objective_requested=objective_requested,
    )
    # Ventanas por cliente: solo el reparto global las construye; el KPI de rebose las usa
    # si existen (el camino sectorial queda sin esperas por ventana, aproximación declarada).
    window_starts: list[float] | None = None
    window_ends: list[float] | None = None
    if partition_disabled_by_objective:
        report(
            "instancia_vrp",
            (
                "Multiobjetivo activo: territorios sector→conductor desactivados para "
                "reparto global de equidad/makespan (R-4)"
            ),
            "info",
        )
    if use_sector_partition and objective_requested:
        # Guard de calibración (Fase 13): el camino sectorial no reenvía λ_b/λ_t/min
        # vehículos ni corre el local search inter-ruta, así que su objetivo NO es el
        # mismo que el global. Se avisa y se marca la corrida para no comparar cruzando
        # esta frontera. Ver docs/fase-3/README-rigor.md.
        report(
            "instancia_vrp",
            (
                "Partición sectorial forzada con objetivo multiobjetivo activo: el camino "
                "sectorial degrada el objetivo (sin equidad/makespan/mín. vehículos ni "
                "local search). No calibrar cruzando esta frontera (R-4)."
            ),
            "warning",
        )
        simulation_parameters["multiObjective"]["objectiveDegradedBySectorPartition"] = True
    if use_sector_partition:
        resolved_sector_driver_map = resolve_sector_driver_map_for_optimization(
            customers,
            vehicles,
            explicit_sector_driver_map,
        )
        assigned_by_vehicle, sector_unassigned = partition_customers_by_vehicle_sectors(
            customers,
            vehicles,
            resolved_sector_driver_map,
        )
        assigned_point_count = sum(len(indices) for indices in assigned_by_vehicle)
        vehicles_with_sectors = sum(1 for indices in assigned_by_vehicle if indices)
        report(
            "instancia_vrp",
            (
                f"Instancia VRP por sectores: {vehicles_with_sectors}/{len(vehicles)} vehículos con puntos, "
                f"{assigned_point_count} contenedores asignados por conductor"
            ),
        )
        if sector_unassigned:
            report(
                "instancia_vrp",
                (
                    f"{len(sector_unassigned)} contenedor(es) sin conductor de flota "
                    "(sector sin asignación o conductor sin vehículo activo)"
                ),
                "warning",
            )
    else:
        assigned_by_vehicle = [[] for _ in vehicles]
        sector_unassigned = []
        assigned_point_count = 0
        vehicles_with_sectors = 0
        if not explicit_sector_driver_map:
            report(
                "instancia_vrp",
                (
                    "Sin territorios sector→conductor en BD: ACO global multi-flota "
                    "(el algoritmo reparte los puntos entre la flota)"
                ),
                "info",
            )
        elif not partition_disabled_by_objective:
            report(
                "instancia_vrp",
                (
                    "Día con sectores sin territorio explícito o armado por zonas: ACO global "
                    "multi-flota en lugar de partición por conductor"
                ),
                "info",
            )

    baseline_demands = [customer.demand_kg for customer in customers]
    baseline_capacities = [vehicle.capacity_kg for vehicle in vehicles]
    if use_sector_partition and objective_requested:
        report(
            "instancia_vrp",
            (
                "Territorios sector→conductor forzados: el objetivo multiobjetivo no aplica "
                "(cada vehículo resuelve su zona de forma independiente; ver R-4)"
            ),
            "warning",
        )
    if use_sector_partition:
        current_solution = _baseline_factible_partitioned(
            assigned_by_vehicle,
            baseline_demands,
            baseline_capacities,
            dist_matrix,
            time_matrix,
            landfill_idx=landfill_idx,
            shift_budget_sec=shift_budget_sec,
            unload_sec=float(unload_seconds),
            service_secs=service_secs,
        )
    else:
        current_solution = _baseline_factible_global(
            len(customers),
            baseline_demands,
            baseline_capacities,
            dist_matrix,
            time_matrix,
            landfill_idx=landfill_idx,
            shift_budget_sec=shift_budget_sec,
            unload_sec=float(unload_seconds),
            service_secs=service_secs,
        )

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

    if use_sector_partition:
        optimized_solution = _optimize_by_sector_assignment(
            customers,
            vehicles,
            assigned_by_vehicle,
            sector_unassigned,
            dist_matrix,
            time_matrix,
            shift_budget_sec=shift_budget_sec,
            unload_sec=float(unload_seconds),
            service_secs=service_secs,
            aco_ants=resolved_aco_ants,
            aco_iterations=resolved_aco_iterations,
            aco_patience=aco_patience,
            seed=resolved_seed,
            cancel_check=cancelled,
            on_iteration=aco_progress,
            priority_fill_level=resolved_priority_fill_level,
            time_window_enabled=resolved_time_window_enabled,
            zone_windows=zone_windows,
            overflow_deadline_sec=overflow_deadlines,
            overflow_rate_kg_per_hour=overflow_rates,
            overflow_weight=overflow_weight,
            alpha=resolved_aco_alpha,
            beta=resolved_aco_beta,
            rho=resolved_aco_rho,
            pheromone_q=resolved_pheromone_q,
            pheromone_elitist=pheromone_elitist,
            two_opt_passes=two_opt_passes,
            at_risk_multiplier=at_risk_multiplier,
            critical_multiplier=critical_multiplier,
            high_multiplier=high_multiplier,
            matrix_critical_factor=matrix_critical_factor,
            matrix_high_factor=matrix_high_factor,
        )
    else:
        fill_pcts = [customer.fill_pct for customer in customers]
        at_risk_flags = [customer.at_risk for customer in customers]
        heuristic_matrix = build_fill_level_heuristic_matrix(
            dist_matrix,
            fill_pcts,
            enabled=resolved_priority_fill_level,
            critical_factor=matrix_critical_factor,
            high_factor=matrix_high_factor,
        )
        window_starts, window_ends = build_customer_time_windows(
            [customer.sector_id for customer in customers],
            enabled=resolved_time_window_enabled,
            zone_windows=zone_windows,
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
            aco_patience=aco_patience,
            seed=resolved_seed,
            cancel_check=cancelled,
            on_iteration=aco_progress,
            heuristic_matrix=heuristic_matrix,
            window_starts=window_starts,
            window_ends=window_ends,
            fill_pcts=fill_pcts,
            priority_fill_level=resolved_priority_fill_level,
            at_risk_flags=at_risk_flags,
            overflow_deadline_sec=overflow_deadlines,
            overflow_rate_kg_per_hour=overflow_rates,
            overflow_weight=overflow_weight,
            alpha=resolved_aco_alpha,
            beta=resolved_aco_beta,
            rho=resolved_aco_rho,
            pheromone_q=resolved_pheromone_q,
            pheromone_elitist=pheromone_elitist,
            two_opt_passes=two_opt_passes,
            at_risk_multiplier=at_risk_multiplier,
            critical_multiplier=critical_multiplier,
            high_multiplier=high_multiplier,
            workload_balance_weight=resolved_workload_balance_weight,
            makespan_weight=resolved_makespan_weight,
            distance_reference_m=current_solution.distance_m,
            min_active_vehicles=effective_min_active_vehicles,
        )
    if not math.isfinite(optimized_solution.distance_m) or not optimized_solution.vehicle_routes:
        report(
            "aco",
            "ACO no encontró solución factible; usando ruta base de referencia",
            "warning",
        )
        optimized_solution = _coalesce_optimized_solution(optimized_solution, current_solution)
    aco_seconds = time.perf_counter() - aco_started
    if optimized_solution.aco_stopped_early:
        report(
            "aco",
            (
                f"ACO detenido por convergencia tras {optimized_solution.aco_iterations_run} "
                f"iteraciones (paciencia={aco_patience})"
            ),
            "info",
        )
    report("refinamiento_2opt", "Aplicando 2-opt local sobre rutas candidatas", "progress")

    optimized_solution = _ensure_demo_anchor_vehicle_route(
        optimized_solution,
        vehicles,
        n_customers,
        dist_matrix,
        time_matrix,
    )

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
        max_route_hours_target=resolved_max_route_hours_target,
    )
    # D1 (Fase 13) — rebose como KPI, no como objetivo: se reporta el rebose proyectado de
    # la solución con el mismo reloj/fórmula del término de costo, pero ``w_ov`` sigue en 0.
    cur_overflow_kg = _solution_overflow_kg(
        current_solution,
        time_matrix=time_matrix,
        landfill_idx=landfill_idx,
        service_secs=service_secs,
        unload_sec=float(unload_seconds),
        shift_budget_sec=shift_budget_sec,
        window_starts=window_starts,
        deadline_sec=overflow_deadlines,
        rate_kg_per_hour=overflow_rates,
        vehicle_count=len(vehicles),
    )
    opt_overflow_kg = _solution_overflow_kg(
        optimized_solution,
        time_matrix=time_matrix,
        landfill_idx=landfill_idx,
        service_secs=service_secs,
        unload_sec=float(unload_seconds),
        shift_budget_sec=shift_budget_sec,
        window_starts=window_starts,
        deadline_sec=overflow_deadlines,
        rate_kg_per_hour=overflow_rates,
        vehicle_count=len(vehicles),
    )
    kpis["overflowKg"] = {
        "current": round(cur_overflow_kg, 1),
        "optimized": round(opt_overflow_kg, 1),
    }
    kpis["overflowKgAvoided"] = round(max(0.0, cur_overflow_kg - opt_overflow_kg), 1)
    kpis["kpiView"] = resolved_kpi_view
    if (
        effective_min_active_vehicles is not None
        and int(kpis.get("activeVehicles") or 0) < effective_min_active_vehicles
    ):
        report(
            "refinamiento_2opt",
            (
                f"No se alcanzó min_active_vehicles={effective_min_active_vehicles}: "
                f"la solución usa {int(kpis.get('activeVehicles') or 0)} vehículo(s) activo(s) "
                "(restricción degradada)"
            ),
            "warning",
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
        aco_patience=aco_patience,
        matrix_cache_hit=matrix_cache_hit,
        matrix_cache_incremental=matrix_meta["matrixCacheIncremental"],
        matrix_patched_cells=matrix_meta["matrixPatchedCells"],
        matrix_parent_point_count=matrix_meta["matrixParentPointCount"],
        graph_load_source=graph_source,
        aco_parallel_workers=optimized_solution.aco_parallel_workers,
        aco_convergence=optimized_solution.aco_convergence,
        two_opt_passes=two_opt_passes,
        pheromone_elitist=pheromone_elitist,
        workload_balance_weight=resolved_workload_balance_weight,
        makespan_weight=resolved_makespan_weight,
        min_active_vehicles=effective_min_active_vehicles,
        max_route_hours_target=resolved_max_route_hours_target,
    )
    kpis["engineMetrics"] = engine_metrics
    simulation_parameters["engineMetrics"] = engine_metrics
    engine_metrics["departureHour"] = resolved_departure_hour
    engine_metrics["trafficBand"] = (
        departure_band.display_label() if departure_band is not None else None
    )
    engine_metrics["trafficBandFactor"] = round(band_factor, 4)

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
            f"La duración optimizada supera la jornada de referencia ({duration_h or 12} h)",
            "warning",
        )

    if not persist:
        # Camino sin persistencia: los consumidores de métricas descartan rutas y waypoints,
        # así que evitamos ensamblar el GeoJSON y escribir la simulación en la BD (INSERTs que
        # el llamador revierte con `auto_commit=False`). Es la mayor parte del tiempo de pared.
        log_entries = _optimization_logs(scenario_label, len(customers), len(vehicles))
        if contingency_meta:
            log_entries = [
                {
                    "message": f"Contingencia: avería en {contingency_meta.get('brokenVehicleCode', 'vehículo')}",
                    "type": "warning",
                },
                {
                    "message": f"Reasignando {contingency_meta.get('pendingPointsCount', 0)} puntos pendientes",
                    "type": "info",
                },
                *log_entries,
            ]
        return {
            "simulationId": None,
            "scenarioId": normalized,
            "caseStudyId": case_study_id,
            "scenario": scenario,
            "kpis": kpis,
            "routes": {
                "current": {"type": "FeatureCollection", "features": []},
                "optimized": {"type": "FeatureCollection", "features": []},
            },
            "logs": [
                {
                    "id": f"log-dryrun-{index}",
                    "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                    "message": entry["message"],
                    "type": entry["type"],
                }
                for index, entry in enumerate(log_entries)
            ],
            "dispatch": {"dispatchedRouteIds": [], "count": 0},
            "contingency": contingency_meta,
            "servedPointCodes": sorted(served_codes),
            "engineMetrics": engine_metrics,
            "dailyPlanId": daily_plan_id,
        }

    current_features = _routes_to_geojson(
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
    )["features"]
    optimized_features = _routes_to_geojson(
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
    )["features"]

    # Una Feature por vehículo (con color distinto) para que el mapa no fusione
    # todas las rutas en una sola línea del mismo color.
    current_geo = {"type": "FeatureCollection", "features": current_features}
    optimized_geo = {"type": "FeatureCollection", "features": optimized_features}

    routes_payload = {"current": current_geo, "optimized": optimized_geo}

    saving_pct = _kpi_saving_percentage(current_solution.distance_m, optimized_solution.distance_m)

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
        case_study_id=case_study_id,
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
        kpi_total_distance_historical=_kpi_distance_km(current_solution.distance_m),
        kpi_total_distance_optimized=_kpi_distance_km(optimized_solution.distance_m),
        kpi_saving_percentage=saving_pct,
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
        departure_at=departure_at,
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

    result: dict[str, Any] = {
        "simulationId": simulation.id,
        "scenarioId": normalized,
        "caseStudyId": case_study_id,
        "scenario": scenario,
        "kpis": kpis,
        "routes": routes_payload,
        "logs": logs,
        "dispatch": dispatch,
        "contingency": contingency_meta,
        "servedPointCodes": sorted(served_codes),
        "engineMetrics": engine_metrics,
        "dailyPlanId": daily_plan_id,
    }
    if include_per_vehicle_routes:
        # Aditivo y bajo demanda: la geometría por vehículo (sin fusionar) solo la
        # consumen las simulaciones de contingencia para animar el plan alternativo.
        result["routesPerVehicle"] = {
            "current": current_features,
            "optimized": optimized_features,
        }
    return result
