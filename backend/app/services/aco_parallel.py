"""Construcción paralela de soluciones por hormiga (ACO) en procesos worker."""

from __future__ import annotations

import math
import os
import random
from typing import TYPE_CHECKING

from app.config import settings
from app.domain.criticality import CRITICAL_FILL_PCT, HIGH_FILL_PCT
from app.services.route_constraints import elapsed_after_visit, is_visit_feasible_with_window

if TYPE_CHECKING:
    from concurrent.futures import ProcessPoolExecutor

ACO_ALPHA = 1.0
ACO_BETA = 3.0

# Sesgos del heurístico de prioridad por llenado (multiplican eta en la ruleta).
HEUR_AT_RISK_MULTIPLIER = 1.50
HEUR_CRITICAL_MULTIPLIER = 1.35
HEUR_HIGH_MULTIPLIER = 1.10

DEFAULT_TWO_OPT_PASSES = 10

# Fase 13 — objetivo multiobjetivo (distancia · equidad · makespan).
# Penalización por vehículo activo faltante cuando se exige ``min_active_vehicles``.
# Es una barrera grande comparada con los tres términos normalizados (O(1)).
#
# Decisión de alcance (Fase 13): se mantiene como *cota inferior* (barrera), no como
# perilla de Pareto. El solver hace lo necesario por alcanzar ``min_active_vehicles`` y
# no premia usar menos camiones. Si se quisiera un compromiso distancia↔flota habría que
# normalizarlo como ``(N_min − activos)/N_min`` y tratarlo como peso; ese eje, de
# existir, debe ser un término aparte para no romper la garantía de flota mínima.
MIN_ACTIVE_VEHICLES_PENALTY = 10.0

# Barrera por cerrar una ruta fuera de la jornada. El vehículo debe regresar a base
# (no se permite dejarlo varado en el vertedero), así que la violación se penaliza en
# lugar de silenciarse. Se expresa como fracción de la jornada, o sea adimensional,
# para que sea comparable con los demás términos normalizados.
SHIFT_OVERFLOW_PENALTY = 10.0

# ``routes`` lleva una entrada por vehículo (vacía si el vehículo no se usó) para que
# ``service_secs``/``capacities`` sigan alineados por índice de vehículo.
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


def _route_timeline(
    route: list[int],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_sec: float,
    unload_sec: float,
    window_starts: list[float] | None = None,
) -> tuple[float, list[tuple[int, float]]]:
    """Reloj único de una ruta: ``(elapsed, [(parada, inicio_de_servicio), ...])``.

    Modelo compartido por el objetivo, las restricciones duras y el local search:
    viaje + servicio por parada + descarga por visita, más la espera por ventana
    (``max(llegada, inicio_de_ventana)``). El vehículo sale del depósito en t=0 y la
    última parada es el regreso, así que ``elapsed`` ya incluye la vuelta a base.
    """
    elapsed = 0.0
    current = route[0] if route else 0
    stops: list[tuple[int, float]] = []
    for node in route[1:]:
        arrival = elapsed + time_matrix[current][node]
        if node == landfill_idx:
            stops.append((node, arrival))
            elapsed = arrival + unload_sec
        elif node == 0:
            elapsed = arrival
        else:
            window_start = window_starts[node - 1] if window_starts is not None else None
            service_start = max(arrival, window_start) if window_start is not None else arrival
            stops.append((node, service_start))
            elapsed = service_start + service_sec
        current = node
    return elapsed, stops


def _route_respects_windows_and_shift(
    route: list[int],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_sec: float,
    unload_sec: float,
    shift_budget_sec: float | None,
    window_starts: list[float] | None,
    window_ends: list[float] | None,
) -> bool:
    """Verifica una ruta completa con el reloj único de ``_route_timeline``.

    Se usa para validar los movimientos locales (2-opt), que no deben romper la
    factibilidad que ya garantizó la construcción. Incluye la pata de regreso al
    depósito, porque un cierre fuera de jornada sigue siendo infactible.
    """
    if shift_budget_sec is None and window_starts is None and window_ends is None:
        return True
    elapsed, stops = _route_timeline(
        route,
        time_matrix,
        landfill_idx=landfill_idx,
        service_sec=service_sec,
        unload_sec=unload_sec,
        window_starts=window_starts,
    )
    if window_ends is not None:
        for node, service_start in stops:
            if node == landfill_idx or node == 0 or node > len(window_ends):
                continue
            window_end = window_ends[node - 1]
            if window_end is not None and service_start + service_sec > window_end + 1e-6:
                return False
    if shift_budget_sec is not None and elapsed > shift_budget_sec + 1e-6:
        return False
    return True


def _two_opt(
    route: list[int],
    dist_matrix: list[list[float]],
    *,
    landfill_idx: int,
    max_passes: int = 10,
    time_matrix: list[list[float]] | None = None,
    service_sec: float = 0.0,
    unload_sec: float = 0.0,
    shift_budget_sec: float | None = None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
) -> list[int]:
    """Mejora 2-opt por distancia, rechazando los intercambios que rompan restricciones.

    Cuando se aporta ``time_matrix`` junto con ventanas o jornada, cada reversión se
    simula antes de aceptarse. Así el 2-opt no puede degradar una ruta factible a
    infactible (antes solo miraba distancia y no reverificaba ventanas ni jornada).
    """
    if landfill_idx in route[1:-1]:
        return route
    if len(route) <= 3:
        return route
    check_feasibility = time_matrix is not None and (
        shift_budget_sec is not None or window_starts is not None or window_ends is not None
    )
    best = route[:]
    for _ in range(max_passes):
        improved = False
        for i in range(1, len(best) - 2):
            for j in range(i + 1, len(best) - 1):
                a, b = best[i - 1], best[i]
                c, d = best[j], best[j + 1]
                old_cost = dist_matrix[a][b] + dist_matrix[c][d]
                new_cost = dist_matrix[a][c] + dist_matrix[b][d]
                if new_cost < old_cost - 1e-6:
                    candidate = best[:i] + best[i : j + 1][::-1] + best[j + 1 :]
                    if (
                        check_feasibility
                        and time_matrix is not None
                        and not _route_respects_windows_and_shift(
                            candidate,
                            time_matrix,
                            landfill_idx=landfill_idx,
                            service_sec=service_sec,
                            unload_sec=unload_sec,
                            shift_budget_sec=shift_budget_sec,
                            window_starts=window_starts,
                            window_ends=window_ends,
                        )
                    ):
                        continue
                    best = candidate
                    improved = True
        if not improved:
            break
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
    fill_pcts: list[int] | None = None,
    priority_fill_level: bool = False,
    at_risk_flags: list[bool] | None = None,
    at_risk_multiplier: float = HEUR_AT_RISK_MULTIPLIER,
    critical_multiplier: float = HEUR_CRITICAL_MULTIPLIER,
    high_multiplier: float = HEUR_HIGH_MULTIPLIER,
) -> int:
    weights = []
    for c in candidates:
        tau = pheromone[current][c] ** alpha
        eta = (1.0 / max(dist_matrix[current][c], 1.0)) ** beta
        if priority_fill_level:
            # El riesgo de calendario (rebose antes de la próxima visita) domina
            # sobre el llenado puntual cuando está disponible.
            if at_risk_flags is not None and 1 <= c <= len(at_risk_flags) and at_risk_flags[c - 1]:
                eta *= at_risk_multiplier
            elif fill_pcts is not None and 1 <= c <= len(fill_pcts):
                fill_pct = fill_pcts[c - 1]
                if fill_pct >= CRITICAL_FILL_PCT:
                    eta *= critical_multiplier
                elif fill_pct >= HIGH_FILL_PCT:
                    eta *= high_multiplier
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


def _fits_shift(
    elapsed: float,
    time_matrix: list[list[float]],
    current: int,
    target: int,
    service_sec: float,
    shift_budget_sec: float | None,
) -> bool:
    """Presupuesto de jornada contando la pata de regreso al depósito.

    Es el criterio único de factibilidad temporal de la construcción: nunca se acepta
    una parada desde la que no se pueda volver a base. Los dos constructores y el
    local search lo comparten para no discrepar sobre qué cabe en el turno.
    """
    if shift_budget_sec is None:
        return True
    return (
        elapsed + time_matrix[current][target] + service_sec + time_matrix[target][0]
        <= shift_budget_sec
    )


def _can_visit_landfill(
    elapsed: float,
    current: int,
    landfill_idx: int,
    time_matrix: list[list[float]],
    unload_sec: float,
    shift_budget_sec: float | None,
) -> bool:
    """Descarga factible: cabe la visita al vertedero y el regreso a base."""
    return _fits_shift(elapsed, time_matrix, current, landfill_idx, unload_sec, shift_budget_sec)


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
) -> tuple[list[int], int, float, float]:
    """Cierra la ruta (vertedero si queda carga y regreso al depósito).

    Devuelve también ``over_budget_sec``: el exceso de jornada del regreso a base.
    El vehículo siempre regresa (no se deja varado en el vertedero) y la violación ya
    no se silencia: se expone para reportarla. El costo de la corrida **no** usa este
    valor: ``_objective_cost`` deriva su propio exceso del reloj único
    (``_route_timeline``), para que hormigas, local search y comparación final midan igual.
    """
    if load > 0 and _can_visit_landfill(
        elapsed, current, landfill_idx, time_matrix, unload_sec, shift_budget_sec
    ):
        route.append(landfill_idx)
        elapsed += time_matrix[current][landfill_idx] + unload_sec
        current = landfill_idx
        load = 0.0

    travel_depot = time_matrix[current][0]
    elapsed_to_depot = elapsed + travel_depot
    over_budget_sec = 0.0
    if shift_budget_sec is not None and elapsed_to_depot > shift_budget_sec:
        over_budget_sec = elapsed_to_depot - shift_budget_sec
    if route[-1] != 0:
        route.append(0)

    return route, current, elapsed, over_budget_sec


def _shift_overflow_penalty(excess_sec: float, shift_budget_sec: float | None) -> float:
    """Penalización adimensional por acumular exceso de jornada.

    Recibe el exceso **total** (suma de las rutas activas) y lo normaliza por la
    jornada, así que vive en la misma escala O(1) que el resto del objetivo combinado
    (distancia normalizada, equidad y makespan).
    """
    if excess_sec <= 0 or not shift_budget_sec or shift_budget_sec <= 0:
        return 0.0
    return SHIFT_OVERFLOW_PENALTY * (excess_sec / shift_budget_sec)


def _overflow_penalty(
    customer_idx: int,
    arrival_sec: float,
    deadline_sec: list[float | None] | None,
    rate_kg_per_hour: list[float] | None,
    weight: float,
) -> float:
    """Costo por rebose de un contenedor servido en ``arrival_sec`` (segundos).

    El rebose comienza al superar la capacidad (``deadline``) y crece a la tasa de
    generación. El peso convierte kg rebosados a unidades de costo (metros).
    """
    if weight <= 0 or deadline_sec is None or rate_kg_per_hour is None:
        return 0.0
    if not (1 <= customer_idx <= min(len(deadline_sec), len(rate_kg_per_hour))):
        return 0.0
    deadline = deadline_sec[customer_idx - 1]
    if deadline is None:
        return 0.0
    over_sec = arrival_sec - deadline
    if over_sec <= 0:
        return 0.0
    overflow_kg = max(0.0, rate_kg_per_hour[customer_idx - 1]) * over_sec / 3600.0
    return overflow_kg * weight


def _route_timelines_by_index(
    routes: list[list[int]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_secs: list[float],
    unload_sec: float,
    window_starts: list[float] | None = None,
) -> list[tuple[float, list[tuple[int, float]]]]:
    """Timelines alineados con ``service_secs`` (una entrada por vehículo).

    ``routes`` y ``service_secs`` comparten el índice de vehículo, de modo que la ruta
    ``k`` se simula con el tiempo de servicio de su camión.
    """
    timelines: list[tuple[float, list[tuple[int, float]]]] = []
    for v_idx, route in enumerate(routes):
        service = service_secs[min(v_idx, len(service_secs) - 1)] if service_secs else 0.0
        timelines.append(
            _route_timeline(
                route,
                time_matrix,
                landfill_idx=landfill_idx,
                service_sec=service,
                unload_sec=unload_sec,
                window_starts=window_starts,
            )
        )
    return timelines


def _has_collection_stop(stops: list[tuple[int, float]], landfill_idx: int) -> bool:
    return any(1 <= node <= landfill_idx - 1 for node, _start in stops)


def _route_hours_by_index(
    routes: list[list[int]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_secs: list[float],
    unload_sec: float,
    window_starts: list[float] | None = None,
) -> list[float]:
    """Horas de servicio por ruta (alineadas al índice de ruta; 0.0 si está vacía).

    Usa el reloj único de ``_route_timeline``, así que incluye las esperas por ventana
    y coincide con el criterio de factibilidad de la construcción.
    """
    return [
        elapsed / 3600.0 if _has_collection_stop(stops, landfill_idx) else 0.0
        for elapsed, stops in _route_timelines_by_index(
            routes,
            time_matrix,
            landfill_idx=landfill_idx,
            service_secs=service_secs,
            unload_sec=unload_sec,
            window_starts=window_starts,
        )
    ]


def route_durations_hours(
    routes: list[list[int]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_secs: list[float],
    unload_sec: float,
    window_starts: list[float] | None = None,
) -> list[float]:
    """Horas de servicio de las rutas activas (con al menos una parada de recolección)."""
    return [
        value
        for value in _route_hours_by_index(
            routes,
            time_matrix,
            landfill_idx=landfill_idx,
            service_secs=service_secs,
            unload_sec=unload_sec,
            window_starts=window_starts,
        )
        if value > 0
    ]


def _solution_overflow_cost(
    timelines: list[tuple[float, list[tuple[int, float]]]],
    *,
    landfill_idx: int,
    shift_budget_sec: float | None,
    deadline_sec: list[float | None] | None,
    rate_kg_per_hour: list[float] | None,
    weight: float,
) -> float:
    """Rebose de una solución completa, en metros de costo.

    Valora cada contenedor servido en su inicio de servicio real (reloj único) y añade
    el de los no atendidos, que siguen rebosando hasta el final de la jornada.
    """
    if weight <= 0:
        return 0.0
    total = 0.0
    served: set[int] = set()
    for _elapsed, stops in timelines:
        for node, service_start in stops:
            if 1 <= node <= landfill_idx - 1:
                served.add(node)
                total += _overflow_penalty(
                    node, service_start, deadline_sec, rate_kg_per_hour, weight
                )
    if shift_budget_sec is not None:
        for customer_idx in range(1, landfill_idx):
            if customer_idx in served:
                continue
            total += _overflow_penalty(
                customer_idx,
                float(shift_budget_sec),
                deadline_sec,
                rate_kg_per_hour,
                weight,
            )
    return total


def solution_overflow_kg(
    routes: list[list[int]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    services: list[float],
    unload_sec: float,
    shift_budget_sec: float | None,
    deadline_sec: list[float | None] | None,
    rate_kg_per_hour: list[float] | None,
    window_starts: list[float] | None = None,
) -> float:
    """Rebose proyectado de una solución, en kg (KPI, no objetivo).

    Reutiliza el reloj único y la misma fórmula del término de costo (``weight=1.0``),
    así que el KPI y el objetivo nunca divergen. ``services`` va alineado con ``routes``
    (una entrada por ruta): aquí las rutas ya vienen filtradas por vehículo activo y no
    comparten el índice de ``service_secs``.

    Se reporta como KPI porque el reloj del rebose arranca en "ahora", mientras que las
    llegadas de ``_route_timeline`` arrancan en la salida de la flota (ver decisión D1).
    """
    if deadline_sec is None or rate_kg_per_hour is None:
        return 0.0
    timelines = [
        _route_timeline(
            route,
            time_matrix,
            landfill_idx=landfill_idx,
            service_sec=service,
            unload_sec=unload_sec,
            window_starts=window_starts,
        )
        for route, service in zip(routes, services)
    ]
    return _solution_overflow_cost(
        timelines,
        landfill_idx=landfill_idx,
        shift_budget_sec=shift_budget_sec,
        deadline_sec=deadline_sec,
        rate_kg_per_hour=rate_kg_per_hour,
        weight=1.0,
    )


def workload_statistics(hours: list[float]) -> tuple[float, float, float]:
    """Media, desviación poblacional e índice de equidad (1 − σ/μ) de las horas.

    El índice de equidad se acota a ``[0, 1]`` para que sea interpretable (D1).
    Con una sola ruta activa (o ninguna) no hay desbalance: equidad = 1.
    """
    if not hours:
        return 0.0, 0.0, 1.0
    mean = sum(hours) / len(hours)
    variance = sum((value - mean) ** 2 for value in hours) / len(hours)
    std = math.sqrt(variance)
    if mean <= 0:
        return mean, std, 1.0
    fairness = max(0.0, min(1.0, 1.0 - std / mean))
    return mean, std, fairness


def _default_distance_reference_m(dist_matrix: list[list[float]]) -> float:
    """Referencia neutra de distancia: ida y vuelta al depósito por cada cliente.

    Solo se usa cuando la corrida no aporta una referencia (baseline). Es
    determinista y proporcional a la escala de la instancia.
    """
    n_customers = max(0, len(dist_matrix) - 2)
    total = sum(dist_matrix[0][idx] + dist_matrix[idx][0] for idx in range(1, n_customers + 1))
    return total if total > 0 else 1.0


def _objective_cost(
    routes: list[list[int]],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    landfill_idx: int,
    service_secs: list[float],
    unload_sec: float,
    shift_budget_sec: float | None,
    distance_reference_m: float | None = None,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    min_active_vehicles: int | None = None,
    window_starts: list[float] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
) -> float:
    """Costo combinado del modelo multiobjetivo (Fase 13, §4).

    ``w_d·(D/D_ref) + w_ov·(rebose/D_ref) + w_b·(σ_horas/μ_horas)
    + w_t·(T_max/H_jornada) + barreras``

    El costo **siempre** se divide por ``distance_reference_m`` (la distancia y el
    rebose comparten escala física de metros), de modo que queda adimensional: así
    ``ρ`` y ``Q`` también se comparan entre modos y ``w_ov`` vive en la misma escala
    que ``λ_b``/``λ_t`` en lugar de mezclar metros crudos con fracciones.

    Para comparar el peso del rebose con ``λ_b``/``λ_t`` hay que leerlo ya normalizado:
    como el rebose viene en metros de costo (``w_ov`` en m/kg), su aporte es
    ``w_ov · kg_rebosados / D_ref``. Es decir, ``w_ov`` se interpreta contra ``D_ref``.

    Todos los términos viven aquí para que los consumidores (hormigas, local search
    inter-ruta y la comparación final de la corrida) midan lo mismo. El rebose se
    recalcula desde las rutas, no se recibe acumulado, así que ningún consumidor puede
    olvidarlo. El reloj es el de ``_route_timeline`` (incluye esperas por ventana).

    ``routes`` lleva una entrada por vehículo, igual que ``service_secs``: las rutas
    vacías aportan 0 y la equidad/makespan solo miran las rutas con paradas.
    """
    distance, _ = _evaluate_solution(routes, dist_matrix, time_matrix)
    reference = distance_reference_m
    if reference is None or reference <= 0:
        reference = _default_distance_reference_m(dist_matrix)
    cost = distance / reference

    needs_workload = workload_balance_weight > 0 or makespan_weight > 0
    needs_floor = min_active_vehicles is not None and min_active_vehicles > 0
    needs_shift = shift_budget_sec is not None and shift_budget_sec > 0
    needs_overflow = overflow_weight > 0
    if not (needs_workload or needs_floor or needs_shift or needs_overflow):
        return cost

    timelines = _route_timelines_by_index(
        routes,
        time_matrix,
        landfill_idx=landfill_idx,
        service_secs=service_secs,
        unload_sec=unload_sec,
        window_starts=window_starts,
    )
    active = [entry for entry in timelines if _has_collection_stop(entry[1], landfill_idx)]
    if needs_workload:
        hours = [elapsed / 3600.0 for elapsed, _stops in active]
        mean_hours, std_hours, _ = workload_statistics(hours)
        cv = max(0.0, min(1.0, std_hours / mean_hours)) if mean_hours > 0 else 0.0
        shift_hours = (
            (shift_budget_sec / 3600.0) if shift_budget_sec and shift_budget_sec > 0 else 0.0
        )
        makespan_norm = (max(hours) / shift_hours) if hours and shift_hours > 0 else 0.0
        cost += workload_balance_weight * cv + makespan_weight * makespan_norm
    if needs_floor and min_active_vehicles is not None:
        cost += MIN_ACTIVE_VEHICLES_PENALTY * max(0, min_active_vehicles - len(active))
    if needs_shift and shift_budget_sec is not None:
        # Cierre fuera de jornada: se acumula el exceso de las rutas activas, así que
        # también lo ven ``_rebalance_pass`` y la comparación final de la corrida.
        excess_sec = sum(max(0.0, elapsed - shift_budget_sec) for elapsed, _stops in active)
        cost += _shift_overflow_penalty(excess_sec, shift_budget_sec)
    if needs_overflow:
        cost += (
            _solution_overflow_cost(
                timelines,
                landfill_idx=landfill_idx,
                shift_budget_sec=shift_budget_sec,
                deadline_sec=overflow_deadline_sec,
                rate_kg_per_hour=overflow_rate_kg_per_hour,
                weight=overflow_weight,
            )
            / reference
        )
    return cost


def _route_max_trip_load(
    route: list[int],
    demands: list[float],
    landfill_idx: int,
) -> float:
    """Carga máxima por viaje de una ruta (el vertedero reinicia la carga)."""
    load = 0.0
    peak = 0.0
    for idx in route:
        if idx == landfill_idx:
            load = 0.0
            continue
        if 1 <= idx <= landfill_idx - 1:
            load += demands[idx - 1]
            peak = max(peak, load)
    return peak


def _best_insertion(
    route: list[int],
    customer: int,
    time_matrix: list[list[float]],
    *,
    demands: list[float],
    capacity: float,
    landfill_idx: int,
    service_sec: float,
    unload_sec: float,
    shift_budget_sec: float | None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
) -> tuple[list[int] | None, float]:
    """Mejor posición de inserción factible (mínimo incremento de viaje).

    Valida el candidato con el criterio único (``_route_respects_windows_and_shift``):
    capacidad, ventanas y jornada con la pata de regreso.
    """
    best_route: list[int] | None = None
    best_delta = math.inf
    for position in range(1, len(route)):
        previous, following = route[position - 1], route[position]
        delta = (
            time_matrix[previous][customer]
            + time_matrix[customer][following]
            - time_matrix[previous][following]
        )
        if delta >= best_delta:
            continue
        candidate = route[:position] + [customer] + route[position:]
        if _route_max_trip_load(candidate, demands, landfill_idx) > capacity + 1e-6:
            continue
        if not _route_respects_windows_and_shift(
            candidate,
            time_matrix,
            landfill_idx=landfill_idx,
            service_sec=service_sec,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
            window_starts=window_starts,
            window_ends=window_ends,
        ):
            continue
        best_route = candidate
        best_delta = delta
    return best_route, best_delta


def _rebalance_pass(
    routes: list[list[int]],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    capacities: list[float],
    demands: list[float],
    landfill_idx: int,
    service_secs: list[float],
    unload_sec: float,
    shift_budget_sec: float | None,
    distance_reference_m: float | None = None,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    min_active_vehicles: int | None = None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
    max_moves: int = 40,
) -> list[list[int]]:
    """Local search inter-ruta (D3): mueve paradas de la ruta más cargada a la más liviana.

    ``_two_opt`` solo reordena dentro de una ruta; la equidad y el makespan necesitan
    mover/intercambiar paradas entre rutas. Solo acepta movimientos que reducen el costo
    combinado y respetan capacidad, ventanas y jornada (vía ``_best_insertion``).

    ``routes`` entra con una entrada por vehículo y ``capacities``/``service_secs`` en esa
    misma alineación, así que cada ruta usa la capacidad y el servicio de su camión. Los
    términos de tiempo y rebose se reevalúan con ``_objective_cost``, de modo que este
    pase mide exactamente lo mismo que las hormigas.
    """
    if len(routes) < 2:
        return routes
    best = [route[:] for route in routes]
    best_cost = _objective_cost(
        best,
        dist_matrix,
        time_matrix,
        landfill_idx=landfill_idx,
        service_secs=service_secs,
        unload_sec=unload_sec,
        shift_budget_sec=shift_budget_sec,
        distance_reference_m=distance_reference_m,
        workload_balance_weight=workload_balance_weight,
        makespan_weight=makespan_weight,
        min_active_vehicles=min_active_vehicles,
        window_starts=window_starts,
        overflow_deadline_sec=overflow_deadline_sec,
        overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
        overflow_weight=overflow_weight,
    )
    for _ in range(max(1, max_moves)):
        hours = _route_hours_by_index(
            best,
            time_matrix,
            landfill_idx=landfill_idx,
            service_secs=service_secs,
            unload_sec=unload_sec,
            window_starts=window_starts,
        )
        active = [idx for idx, value in enumerate(hours) if value > 0]
        if len(active) < 2:
            break
        source = max(active, key=lambda idx: hours[idx])
        target = min(active, key=lambda idx: hours[idx])
        if hours[source] - hours[target] <= 1e-9:
            break
        stops = [idx for idx in best[source] if 1 <= idx <= landfill_idx - 1]
        if not stops:
            break

        candidate_best: list[list[int]] | None = None
        candidate_cost = best_cost
        target_capacity = capacities[min(target, len(capacities) - 1)] if capacities else 0.0
        target_service = service_secs[min(target, len(service_secs) - 1)] if service_secs else 0.0
        for stop in stops:
            inserted, _delta = _best_insertion(
                best[target],
                stop,
                time_matrix,
                demands=demands,
                capacity=target_capacity,
                landfill_idx=landfill_idx,
                service_sec=target_service,
                unload_sec=unload_sec,
                shift_budget_sec=shift_budget_sec,
                window_starts=window_starts,
                window_ends=window_ends,
            )
            if inserted is None:
                continue
            candidate = [route[:] for route in best]
            candidate[source] = [idx for idx in best[source] if idx != stop]
            candidate[target] = inserted
            cost = _objective_cost(
                candidate,
                dist_matrix,
                time_matrix,
                landfill_idx=landfill_idx,
                service_secs=service_secs,
                unload_sec=unload_sec,
                shift_budget_sec=shift_budget_sec,
                distance_reference_m=distance_reference_m,
                workload_balance_weight=workload_balance_weight,
                makespan_weight=makespan_weight,
                min_active_vehicles=min_active_vehicles,
                window_starts=window_starts,
                overflow_deadline_sec=overflow_deadline_sec,
                overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
                overflow_weight=overflow_weight,
            )
            if cost < candidate_cost - 1e-9:
                candidate_cost = cost
                candidate_best = candidate
        if candidate_best is None:
            break
        best = candidate_best
        best_cost = candidate_cost
    return best


def _build_balanced_ant_solution(
    ant_seed: int,
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
    *,
    heuristic_matrix: list[list[float]] | None = None,
    landfill_idx: int | None = None,
    shift_budget_sec: float | None = None,
    unload_sec: float = 0.0,
    service_secs: list[float] | None = None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
    fill_pcts: list[int] | None = None,
    priority_fill_level: bool = False,
    at_risk_flags: list[bool] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
    at_risk_multiplier: float = HEUR_AT_RISK_MULTIPLIER,
    critical_multiplier: float = HEUR_CRITICAL_MULTIPLIER,
    high_multiplier: float = HEUR_HIGH_MULTIPLIER,
    two_opt_passes: int = DEFAULT_TWO_OPT_PASSES,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    distance_reference_m: float | None = None,
    min_active_vehicles: int | None = None,
) -> AntSolution:
    """Construcción balanceada (D2): el cliente lo elige la feromona, el camión no.

    La construcción secuencial llena el primer camión a tope y deja el resto ocioso.
    Aquí los camiones se abren de a uno (el mínimo necesario para la jornada) y cada
    parada se asigna al **camión menos cargado** ya abierto, de modo que las horas se
    reparten entre la flota sin multiplicar los viajes a base. La factibilidad de
    jornada incluye el regreso al depósito, así que ninguna ruta supera el turno.
    """
    pick_matrix = heuristic_matrix if heuristic_matrix is not None else dist_matrix
    rng = random.Random(ant_seed)
    n_vehicles = len(capacities)
    landfill = landfill_idx if landfill_idx is not None else n_customers + 1
    service_per_vehicle = service_secs or [0.0] * n_vehicles
    customer_indices = list(range(1, n_customers + 1))
    unvisited = set(customer_indices)
    routes: list[list[int]] = [[0] for _ in range(n_vehicles)]
    loads = [0.0] * n_vehicles
    elapsed = [0.0] * n_vehicles
    current = [0] * n_vehicles
    closed = [False] * n_vehicles
    opened: list[int] = []
    # Restricción de flota mínima (RF-3): abrir al menos ``min_active_vehicles`` camiones.
    required_vehicles = min(n_vehicles, n_customers, max(1, int(min_active_vehicles or 0)))

    def _add_landfill(v: int) -> bool:
        """Descarga en vertedero si el regreso al depósito aún cabe en la jornada."""
        if loads[v] <= 0:
            return False
        if not _fits_shift(
            elapsed[v], time_matrix, current[v], landfill, unload_sec, shift_budget_sec
        ):
            return False
        routes[v].append(landfill)
        elapsed[v] += time_matrix[current[v]][landfill] + unload_sec
        loads[v] = 0.0
        current[v] = landfill
        return True

    def _add_customer(v: int) -> bool:
        """Agrega una parada al camión ``v`` eligiendo el cliente por feromona."""
        cap = capacities[v]
        service_sec = service_per_vehicle[min(v, len(service_per_vehicle) - 1)]
        candidates = [c for c in unvisited if loads[v] + demands[c - 1] <= cap]
        if not candidates:
            return _add_landfill(v)
        affordable = [
            c
            for c in candidates
            if _fits_shift(
                elapsed[v], time_matrix, current[v], c, service_sec, shift_budget_sec
            )
        ]
        if window_starts is not None and window_ends is not None:
            affordable = [
                c
                for c in affordable
                if is_visit_feasible_with_window(
                    elapsed[v],
                    current[v],
                    c,
                    service_sec,
                    time_matrix,
                    window_start=window_starts[c - 1],
                    window_end=window_ends[c - 1],
                    shift_budget_sec=shift_budget_sec,
                )
            ]
        if not affordable:
            return _add_landfill(v)
        chosen = _pick_candidate(
            rng,
            current[v],
            affordable,
            pheromone,
            pick_matrix,
            alpha=alpha,
            beta=beta,
            fill_pcts=fill_pcts,
            priority_fill_level=priority_fill_level,
            at_risk_flags=at_risk_flags,
            at_risk_multiplier=at_risk_multiplier,
            critical_multiplier=critical_multiplier,
            high_multiplier=high_multiplier,
        )
        routes[v].append(chosen)
        window_start = window_starts[chosen - 1] if window_starts is not None else None
        elapsed[v] = elapsed_after_visit(
            elapsed[v],
            current[v],
            chosen,
            service_sec,
            time_matrix,
            window_start=window_start,
        )
        loads[v] += demands[chosen - 1]
        current[v] = chosen
        unvisited.remove(chosen)
        return True

    while unvisited:
        placed = False
        # Entre los camiones ya abiertos, el menos cargado que aún pueda cargar.
        for v in sorted((v for v in opened if not closed[v]), key=lambda v: (elapsed[v], v)):
            if _add_customer(v):
                placed = True
                break
            closed[v] = True
        if placed:
            continue
        # Los camiones abiertos se saturaron: abrir el mínimo necesario (o la cuota mínima).
        target = min(n_vehicles, max(len(opened) + 1, required_vehicles))
        if len(opened) >= target:
            break
        while len(opened) < target:
            next_idx = next((v for v in range(n_vehicles) if v not in opened), None)
            if next_idx is None:
                break
            opened.append(next_idx)

    for v in range(n_vehicles):
        closed_route, _, _, _over_budget = _close_route(
            routes[v],
            current=current[v],
            load=loads[v],
            elapsed=elapsed[v],
            landfill_idx=landfill,
            time_matrix=time_matrix,
            unload_sec=unload_sec,
            shift_budget_sec=shift_budget_sec,
        )
        if len(closed_route) > 2:
            closed_route = _two_opt(
                closed_route,
                dist_matrix,
                landfill_idx=landfill,
                max_passes=two_opt_passes,
                time_matrix=time_matrix,
                service_sec=service_per_vehicle[min(v, len(service_per_vehicle) - 1)],
                unload_sec=unload_sec,
                shift_budget_sec=shift_budget_sec,
                window_starts=window_starts,
                window_ends=window_ends,
            )
        routes[v] = closed_route

    served: set[int] = set()
    for route in routes:
        for idx in route:
            if 1 <= idx <= n_customers:
                served.add(idx)
    uncovered = [c for c in customer_indices if c not in served]

    cost = _objective_cost(
        routes,
        dist_matrix,
        time_matrix,
        landfill_idx=landfill,
        service_secs=service_per_vehicle,
        unload_sec=unload_sec,
        shift_budget_sec=shift_budget_sec,
        distance_reference_m=distance_reference_m,
        workload_balance_weight=workload_balance_weight,
        makespan_weight=makespan_weight,
        min_active_vehicles=min_active_vehicles,
        window_starts=window_starts,
        overflow_deadline_sec=overflow_deadline_sec,
        overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
        overflow_weight=overflow_weight,
    )
    _, duration = _evaluate_solution(routes, dist_matrix, time_matrix)
    return routes, cost, duration, uncovered


def build_ant_solution(
    ant_seed: int,
    n_customers: int,
    demands: list[float],
    capacities: list[float],
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pheromone: list[list[float]],
    *,
    heuristic_matrix: list[list[float]] | None = None,
    landfill_idx: int | None = None,
    shift_budget_sec: float | None = None,
    unload_sec: float = 0.0,
    service_secs: list[float] | None = None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
    fill_pcts: list[int] | None = None,
    priority_fill_level: bool = False,
    at_risk_flags: list[bool] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
    at_risk_multiplier: float = HEUR_AT_RISK_MULTIPLIER,
    critical_multiplier: float = HEUR_CRITICAL_MULTIPLIER,
    high_multiplier: float = HEUR_HIGH_MULTIPLIER,
    two_opt_passes: int = DEFAULT_TWO_OPT_PASSES,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    distance_reference_m: float | None = None,
    min_active_vehicles: int | None = None,
) -> AntSolution:
    if (
        workload_balance_weight > 0
        or makespan_weight > 0
        or (min_active_vehicles is not None and min_active_vehicles > 1)
    ) and ant_seed % 2 == 0:
        # La mitad de las hormigas explora la construcción balanceada (servicio); el
        # resto la secuencial (distancia). Los pesos eligen el compromiso de Pareto.
        return _build_balanced_ant_solution(
            ant_seed,
            n_customers,
            demands,
            capacities,
            dist_matrix,
            time_matrix,
            pheromone,
            heuristic_matrix=heuristic_matrix,
            landfill_idx=landfill_idx,
            shift_budget_sec=shift_budget_sec,
            unload_sec=unload_sec,
            service_secs=service_secs,
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
            distance_reference_m=distance_reference_m,
            min_active_vehicles=min_active_vehicles,
        )

    pick_matrix = heuristic_matrix if heuristic_matrix is not None else dist_matrix
    rng = random.Random(ant_seed)
    n_vehicles = len(capacities)
    landfill = landfill_idx if landfill_idx is not None else n_customers + 1
    service_per_vehicle = service_secs or [0.0] * n_vehicles
    customer_indices = list(range(1, n_customers + 1))
    unvisited = set(customer_indices)
    routes: list[list[int]] = [[] for _ in range(n_vehicles)]

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

            affordable = [
                c
                for c in candidates
                if _fits_shift(elapsed, time_matrix, current, c, service_sec, shift_budget_sec)
            ]
            if window_starts is not None and window_ends is not None:
                affordable = [
                    c
                    for c in affordable
                    if is_visit_feasible_with_window(
                        elapsed,
                        current,
                        c,
                        service_sec,
                        time_matrix,
                        window_start=window_starts[c - 1],
                        window_end=window_ends[c - 1],
                        shift_budget_sec=shift_budget_sec,
                    )
                ]
            if not affordable:
                break

            chosen = _pick_candidate(
                rng,
                current,
                affordable,
                pheromone,
                pick_matrix,
                alpha=alpha,
                beta=beta,
                fill_pcts=fill_pcts,
                priority_fill_level=priority_fill_level,
                at_risk_flags=at_risk_flags,
                at_risk_multiplier=at_risk_multiplier,
                critical_multiplier=critical_multiplier,
                high_multiplier=high_multiplier,
            )
            route.append(chosen)
            window_start = window_starts[chosen - 1] if window_starts is not None else None
            elapsed = elapsed_after_visit(
                elapsed,
                current,
                chosen,
                service_sec,
                time_matrix,
                window_start=window_start,
            )
            load += demands[chosen - 1]
            unvisited.remove(chosen)
            current = chosen

        route, _, _, _over_budget = _close_route(
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
            route = _two_opt(
                route,
                dist_matrix,
                landfill_idx=landfill,
                max_passes=two_opt_passes,
                time_matrix=time_matrix,
                service_sec=service_sec,
                unload_sec=unload_sec,
                shift_budget_sec=shift_budget_sec,
                window_starts=window_starts,
                window_ends=window_ends,
            )
        routes[v_idx] = route

    served: set[int] = set()
    for route in routes:
        for idx in route:
            if 1 <= idx <= n_customers:
                served.add(idx)
    uncovered = [c for c in customer_indices if c not in served]

    cost = _objective_cost(
        routes,
        dist_matrix,
        time_matrix,
        landfill_idx=landfill,
        service_secs=service_per_vehicle,
        unload_sec=unload_sec,
        shift_budget_sec=shift_budget_sec,
        distance_reference_m=distance_reference_m,
        workload_balance_weight=workload_balance_weight,
        makespan_weight=makespan_weight,
        min_active_vehicles=min_active_vehicles,
        window_starts=window_starts,
        overflow_deadline_sec=overflow_deadline_sec,
        overflow_rate_kg_per_hour=overflow_rate_kg_per_hour,
        overflow_weight=overflow_weight,
    )
    _, duration = _evaluate_solution(routes, dist_matrix, time_matrix)
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
    heuristic_matrix: list[list[float]] | None,
    window_starts: list[float] | None,
    window_ends: list[float] | None,
    fill_pcts: list[int] | None,
    priority_fill_level: bool,
    at_risk_flags: list[bool] | None,
    overflow_deadline_sec: list[float | None] | None,
    overflow_rate_kg_per_hour: list[float] | None,
    overflow_weight: float,
    at_risk_multiplier: float,
    critical_multiplier: float,
    high_multiplier: float,
    two_opt_passes: int,
    alpha: float,
    beta: float,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    distance_reference_m: float | None = None,
    min_active_vehicles: int | None = None,
) -> AntSolution:
    return build_ant_solution(
        ant_seed,
        n_customers,
        demands,
        capacities,
        dist_matrix,
        time_matrix,
        pheromone,
        heuristic_matrix=heuristic_matrix,
        landfill_idx=landfill_idx,
        shift_budget_sec=shift_budget_sec,
        unload_sec=unload_sec,
        service_secs=service_secs,
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
        distance_reference_m=distance_reference_m,
        min_active_vehicles=min_active_vehicles,
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
    heuristic_matrix: list[list[float]] | None = None,
    window_starts: list[float] | None = None,
    window_ends: list[float] | None = None,
    fill_pcts: list[int] | None = None,
    priority_fill_level: bool = False,
    at_risk_flags: list[bool] | None = None,
    overflow_deadline_sec: list[float | None] | None = None,
    overflow_rate_kg_per_hour: list[float] | None = None,
    overflow_weight: float = 0.0,
    at_risk_multiplier: float = HEUR_AT_RISK_MULTIPLIER,
    critical_multiplier: float = HEUR_CRITICAL_MULTIPLIER,
    high_multiplier: float = HEUR_HIGH_MULTIPLIER,
    two_opt_passes: int = DEFAULT_TWO_OPT_PASSES,
    alpha: float = ACO_ALPHA,
    beta: float = ACO_BETA,
    workload_balance_weight: float = 0.0,
    makespan_weight: float = 0.0,
    distance_reference_m: float | None = None,
    min_active_vehicles: int | None = None,
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
                heuristic_matrix=heuristic_matrix,
                landfill_idx=landfill_idx,
                shift_budget_sec=shift_budget_sec,
                unload_sec=unload_sec,
                service_secs=service_secs,
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
                distance_reference_m=distance_reference_m,
                min_active_vehicles=min_active_vehicles,
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
                heuristic_matrix,
                window_starts,
                window_ends,
                fill_pcts,
                priority_fill_level,
                at_risk_flags,
                overflow_deadline_sec,
                overflow_rate_kg_per_hour,
                overflow_weight,
                at_risk_multiplier,
                critical_multiplier,
                high_multiplier,
                two_opt_passes,
                alpha,
                beta,
                workload_balance_weight,
                makespan_weight,
                distance_reference_m,
                min_active_vehicles,
            )
            for seed in ant_seeds
        ]
        return [future.result() for future in futures]
    finally:
        if owns_pool:
            pool.shutdown(wait=True)
