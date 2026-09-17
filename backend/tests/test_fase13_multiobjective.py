"""Fase 13 — motor de optimización multiobjetivo (distancia · flota · tiempo).

Cubre la estrategia de verificación de §12: nivel 1 (unitario determinista) y
nivel 3 (regresión RNF-2 con línea base caracterizada).
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.db.models import RouteWaypoint
from app.services.aco_parallel import (
    _default_distance_reference_m,
    _objective_cost,
    build_ant_solution,
    solution_overflow_kg,
    workload_statistics,
)
from app.services.admin_service import resolve_operational_timezone
from app.services.optimization_service import (
    CustomerNode,
    RouteSolution,
    VehicleUnit,
    _aco_cvrp,
    _baseline_route,
    _compute_kpis,
    _persist_routes,
    _route_vehicle_index,
    _solution_operational_metrics,
    resolve_min_active_vehicles,
    resolve_sector_partition,
    resolve_shift_hours,
)
from app.services.multiobjective_sweep_service import (
    build_pareto_frontier,
    evaluate_acceptance_criteria,
)
from app.services.weekly_operational_service import (
    _rotation_rest_ids,
    compute_weekly_rotation_kpis,
)
from tests.db_fixtures import mock_db_with_settings
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


def _vehicle(index: int, *, assigned: int = 6) -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=index,
        driver_id=index,
        capacity_kg=30.0,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=assigned,
        code=f"T-{index:02d}",
    )


def _customers(n: int, demands: list[float]) -> list[CustomerNode]:
    return [
        CustomerNode(i + 1, f"C{i + 1}", 0, demands[i], 50, 0.0, 0.0) for i in range(n)
    ]


# --------------------------------------------------------------------------- #
# 13.1 — métricas por ruta y KPIs aditivos
# --------------------------------------------------------------------------- #


def test_vehicle_workloads_seconds_exact():
    """Horas de servicio por ruta = (viaje + paradas·20 min + descargas) / 3600."""
    n_customers = 6
    dist, time = vrp_matrix(n_customers, base=100.0)
    vehicles = [_vehicle(1), _vehicle(2), _vehicle(3)]
    solution = RouteSolution(
        vehicle_routes=[[0, 1, 2, 0], [0, 3, 0], [0, 0]],
        distance_m=0.0,
        duration_s=0.0,
    )

    metrics = _solution_operational_metrics(
        solution,
        dist,
        time,
        vehicles,
        n_customers=n_customers,
        unload_seconds=900,
        shift_budget_seconds=43_200,
    )

    # Ruta 1: viaje 40 s + 2 paradas × 1200 s = 2440 s; Ruta 2: 60 s + 1200 s = 1260 s.
    assert metrics["route_hours"] == pytest.approx([2440 / 3600, 1260 / 3600])
    assert metrics["vehicle_workload_hours"] == pytest.approx([0.68, 0.35, 0.0])
    assert metrics["active_vehicles"] == 2
    assert metrics["max_route_hours"] == pytest.approx(0.68)
    assert metrics["workload_mean_hours"] == pytest.approx(0.51, abs=0.01)
    assert metrics["workload_std_hours"] == pytest.approx(0.16, abs=0.01)
    assert metrics["fairness_index"] == pytest.approx(0.68, abs=0.01)


def test_reported_route_uses_real_vehicle_not_position():
    """``vehicle_indices`` fija la tripulación de cada ruta activa.

    ``vehicle_routes`` solo trae rutas con paradas, así que la posición no es el índice de
    vehículo: sin el campo, la ruta del tercer camión se valoraría con la tripulación del
    primero (y su carga caería en el slot equivocado).
    """
    n_customers = 6
    dist, time = vrp_matrix(n_customers, base=100.0)
    # Índice 2 con 3 operarios de campo: 1200 + 3·180 = 1740 s por parada.
    vehicles = [_vehicle(1, assigned=6), _vehicle(2, assigned=6), _vehicle(3, assigned=3)]
    solution = RouteSolution(
        vehicle_routes=[[0, 1, 2, 0]],
        vehicle_indices=[2],
        distance_m=0.0,
        duration_s=0.0,
    )

    metrics = _solution_operational_metrics(
        solution,
        dist,
        time,
        vehicles,
        n_customers=n_customers,
        unload_seconds=900,
        shift_budget_seconds=43_200,
    )

    # Dos paradas con la tripulación real del tercer camión, no con la del primero.
    assert metrics["service_s"] == 2 * 1740
    assert metrics["crew_assignment"] == "3/6"
    assert metrics["vehicle_workload_hours"][2] > 0
    assert metrics["vehicle_workload_hours"][0] == 0.0


def test_route_vehicle_index_falls_back_to_position():
    """Sin ``vehicle_indices`` se conserva el comportamiento por posición."""
    positional = RouteSolution(vehicle_routes=[[0, 1, 0]], vehicle_indices=None)
    explicit = RouteSolution(vehicle_routes=[[0, 1, 0]], vehicle_indices=[2])

    assert _route_vehicle_index(positional, 0, 3) == 0
    assert _route_vehicle_index(explicit, 0, 3) == 2


def test_workload_statistics_handles_empty_and_single_route():
    assert workload_statistics([]) == (0.0, 0.0, 1.0)
    mean, std, fairness = workload_statistics([5.0])
    assert mean == 5.0
    assert std == 0.0
    assert fairness == 1.0


def test_kpi_active_vehicles_counts_nonempty_routes():
    n_customers = 6
    dist, time = vrp_matrix(n_customers, base=100.0)
    vehicles = [_vehicle(1), _vehicle(2)]
    solution = RouteSolution(vehicle_routes=[[0, 1, 2, 0], [0, 0]])
    customers = _customers(n_customers, [5.0] * n_customers)

    kpis = _compute_kpis(
        solution,
        solution,
        customers,
        {customer.code for customer in customers},
        vehicles,
        dist,
        time,
        shift_budget_seconds=43_200,
    )

    assert kpis["activeVehicles"] == 1
    assert kpis["fleetUtilizationPct"] == 50.0
    assert len(kpis["vehicleWorkloadHours"]) == 2
    assert kpis["vehicleWorkloadHours"][1] == 0.0


def test_kpi_max_route_hours_and_slack():
    n_customers = 6
    dist, time = vrp_matrix(n_customers, base=100.0)
    vehicles = [_vehicle(1), _vehicle(2)]
    solution = RouteSolution(vehicle_routes=[[0, 1, 2, 0], [0, 3, 0]])
    customers = _customers(n_customers, [5.0] * n_customers)

    kpis = _compute_kpis(
        solution,
        solution,
        customers,
        {customer.code for customer in customers},
        vehicles,
        dist,
        time,
        shift_budget_seconds=43_200,
        max_route_hours_target=1.0,
    )

    assert kpis["maxRouteHours"] == pytest.approx(0.68)
    assert kpis["shiftSlackHours"] == pytest.approx(12.0 - 0.68, abs=0.01)
    assert kpis["finishUnderTargetPct"] == 100.0
    assert kpis["maxRouteHoursTarget"] == 1.0

    tight = _compute_kpis(
        solution,
        solution,
        customers,
        {customer.code for customer in customers},
        vehicles,
        dist,
        time,
        shift_budget_seconds=43_200,
        max_route_hours_target=0.5,
    )
    assert tight["finishUnderTargetPct"] == 50.0


# --------------------------------------------------------------------------- #
# 13.2 — equidad y makespan en la aptitud
# --------------------------------------------------------------------------- #


def _fairness_instance() -> tuple[
    int, list[float], list[float], list[list[float]], list[list[float]], dict
]:
    n_customers = 5
    demands = [5.0] * n_customers
    capacities = [30.0, 30.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = {
        "landfill_idx": n_customers + 1,
        "shift_budget_sec": 5000.0,
        "unload_sec": 900.0,
        "service_secs": [1200.0, 1200.0],
    }
    return n_customers, demands, capacities, dist, time, kwargs


def _run_fairness_case(**overrides):
    n_customers, demands, capacities, dist, time, kwargs = _fairness_instance()
    vehicles = [_vehicle(1), _vehicle(2)]
    base = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=6,
        aco_iterations=8,
        aco_patience=0,
        seed=99,
        **kwargs,
    )
    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=6,
        aco_iterations=8,
        aco_patience=0,
        seed=99,
        distance_reference_m=base.distance_m,
        **overrides,
        **kwargs,
    )
    metrics = _solution_operational_metrics(
        solution,
        dist,
        time,
        vehicles,
        n_customers=n_customers,
        unload_seconds=900,
        shift_budget_seconds=5000,
    )
    return base, solution, metrics


def test_fairness_index_monotonic_with_weight():
    """RF-2: al aumentar w_b, workloadStdHours no aumenta (monotonía)."""
    observed = []
    for weight in (0.0, 0.5, 2.0, 5.0):
        _base, _solution, metrics = _run_fairness_case(workload_balance_weight=weight)
        observed.append(metrics["workload_std_hours"])

    assert observed == sorted(observed, reverse=True), observed
    assert observed[0] > observed[-1]


def test_makespan_weight_reduces_or_keeps_max_route_hours():
    """RF-4: el término de makespan no aumenta la ruta más larga."""
    _base, _solution, baseline = _run_fairness_case()
    _base2, _solution2, weighted = _run_fairness_case(makespan_weight=2.0)

    assert weighted["max_route_hours"] <= baseline["max_route_hours"] + 1e-9


def test_objective_cost_zero_weights_is_normalized_distance():
    """Sin pesos el costo es distancia/referencia: adimensional y comparable.

    La división por ``D_ref`` es lo que hace comparables ρ y Q entre el modo
    mono-objetivo y el multiobjetivo; el orden de las soluciones no cambia, así
    que la ruta elegida es la misma (RNF-2).
    """
    n_customers = 5
    dist, time = vrp_matrix(n_customers, base=100.0)
    routes = [[0, 1, 2, 0], [0, 3, 4, 0]]

    plain = _objective_cost(
        routes,
        dist,
        time,
        landfill_idx=n_customers + 1,
        service_secs=[1200.0, 1200.0],
        unload_sec=900.0,
        shift_budget_sec=43_200.0,
    )

    raw = sum(dist[i][j] for r in routes for i, j in zip(r[:-1], r[1:]))
    reference = _default_distance_reference_m(dist)
    assert plain == pytest.approx(raw / reference)

    # Dos soluciones con la misma distancia comparten costo; la menor distancia
    # siempre gana, con o sin normalizar.
    longer = _objective_cost(
        [[0, 5, 1, 4, 2, 0]],
        dist,
        time,
        landfill_idx=n_customers + 1,
        service_secs=[1200.0],
        unload_sec=900.0,
        shift_budget_sec=43_200.0,
    )
    assert plain < longer


def test_build_ant_solution_zero_weights_matches_default():
    n_customers = 5
    demands = [5.0] * n_customers
    capacities = [30.0, 30.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 2)
    pheromone = [[1.0] * (n_customers + 2) for _ in range(n_customers + 2)]

    default = build_ant_solution(7, n_customers, demands, capacities, dist, time, pheromone, **kwargs)
    explicit_zero = build_ant_solution(
        7,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        workload_balance_weight=0.0,
        makespan_weight=0.0,
        min_active_vehicles=None,
        **kwargs,
    )

    assert explicit_zero == default


# --------------------------------------------------------------------------- #
# 13.3 — restricción de flota mínima
# --------------------------------------------------------------------------- #


def _min_active_instance() -> tuple[int, list[float], list[float], list[list[float]], list[list[float]], dict]:
    n_customers = 8
    demands = [7.0, 9.0, 5.0, 11.0, 6.0, 8.0, 4.0, 10.0]
    capacities = [30.0, 30.0, 30.0]
    dist, time = vrp_matrix(n_customers, base=250.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 3)
    return n_customers, demands, capacities, dist, time, kwargs


def test_min_active_vehicles_constraint_enforced():
    n_customers, demands, capacities, dist, time, kwargs = _min_active_instance()
    base = _aco_cvrp(
        n_customers, demands, capacities, dist, time, aco_ants=6, aco_iterations=8,
        aco_patience=0, seed=1234, **kwargs,
    )
    assert len(base.vehicle_routes) < 3

    constrained = _aco_cvrp(
        n_customers, demands, capacities, dist, time, aco_ants=6, aco_iterations=8,
        aco_patience=0, seed=1234, min_active_vehicles=3,
        distance_reference_m=base.distance_m, **kwargs,
    )

    assert len(constrained.vehicle_routes) >= 3
    assert constrained.uncovered_customer_indices == []


def test_min_active_vehicles_infeasible_warns():
    effective, warning = resolve_min_active_vehicles(
        5, available_customers=3, available_vehicles=8
    )
    assert effective == 3
    assert warning is not None and "infactible" in warning and "degrada" in warning

    effective_zero, warning_zero = resolve_min_active_vehicles(
        3, available_customers=0, available_vehicles=8
    )
    assert effective_zero is None
    assert warning_zero is not None and "desactivada" in warning_zero

    feasible, no_warning = resolve_min_active_vehicles(
        2, available_customers=8, available_vehicles=8
    )
    assert feasible == 2
    assert no_warning is None

    disabled, disabled_warning = resolve_min_active_vehicles(
        None, available_customers=8, available_vehicles=8
    )
    assert disabled is None
    assert disabled_warning is None


# --------------------------------------------------------------------------- #
# RNF-2 — compatibilidad con pesos 0 (línea base caracterizada en 13.0)
# --------------------------------------------------------------------------- #

# Capturado del motor ANTES de la Fase 13 (HEAD) sobre la misma instancia/seed.
BASELINE_ROUTES = [[0, 1, 2, 3, 6, 9, 5, 4, 7, 9, 8, 9, 0]]
BASELINE_DISTANCE_M = 7500.0
BASELINE_DURATION_S = 750.0
BASELINE_KPIS = {
    "co2KgAvoided": 0,
    "containersServed": 8,
    "coveragePct": {"current": 100, "optimized": 100},
    "criticalCoveragePct": {"current": 100, "optimized": 100},
    "distanceKm": {"current": 4.0, "optimized": 7.5},
    "durationBreakdown": {
        "current": {
            "crewAssignment": "6/6",
            "crewLabel": "6/6 (conductor + 5 operarios)",
            "landfillTrips": 0,
            "serviceHours": 2.67,
            "shiftBudgetHours": 12.0,
            "shiftUsedHours": 2.78,
            "shiftUtilizationPct": 23.1,
            "stopCount": 8,
            "travelHours": 0.11,
            "uncoveredPoints": 0,
            "unloadHours": 0.0,
        },
        "optimized": {
            "crewAssignment": "6/6",
            "crewLabel": "6/6 (conductor + 5 operarios)",
            "landfillTrips": 3,
            "serviceHours": 2.67,
            "shiftBudgetHours": 12.0,
            "shiftUsedHours": 3.62,
            "shiftUtilizationPct": 30.2,
            "stopCount": 8,
            "travelHours": 0.21,
            "uncoveredPoints": 0,
            "unloadHours": 0.75,
        },
    },
    "durationHours": {"current": 2.78, "optimized": 3.62},
    "exceedsWorkday": {"current": False, "optimized": False},
    "fuelLiters": {"current": 1.4, "optimized": 2.6},
    "iec": -87.5,
    "landfillTrips": 3,
    "landfillTripsPerVehicle": 3.0,
    "savingPct": -87.5,
    "shiftUtilizationPct": 30.2,
    "uncoveredPoints": 0,
    "unloadTimeHours": 0.75,
    "workdayHours": 12,
}

EXISTING_KPI_KEYS = list(BASELINE_KPIS.keys())


def test_zero_weights_reproduce_baseline_kpis():
    """RNF-2: con w_b = w_t = 0 y sin min_active_vehicles, la salida es idéntica."""
    n_customers = 8
    demands = [7.0, 9.0, 5.0, 11.0, 6.0, 8.0, 4.0, 10.0]
    capacities = [30.0, 30.0, 30.0]
    dist, time = vrp_matrix(n_customers, base=250.0)
    kwargs = aco_multi_trip_kwargs(n_customers, len(capacities))

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=6,
        aco_iterations=8,
        aco_patience=0,
        seed=1234,
        workload_balance_weight=0.0,
        makespan_weight=0.0,
        min_active_vehicles=None,
        **kwargs,
    )
    vehicles = [_vehicle(i + 1) for i in range(len(capacities))]
    customers = _customers(n_customers, demands)
    current = _baseline_route(n_customers, dist, time)
    kpis = _compute_kpis(
        current,
        solution,
        customers,
        {customer.code for customer in customers},
        vehicles,
        dist,
        time,
        workday_hours=12,
        unload_seconds=900,
        shift_budget_seconds=43_200,
        uncovered_point_codes=[],
    )

    assert solution.vehicle_routes == BASELINE_ROUTES
    assert solution.distance_m == pytest.approx(BASELINE_DISTANCE_M)
    assert solution.duration_s == pytest.approx(BASELINE_DURATION_S)
    assert {key: kpis[key] for key in EXISTING_KPI_KEYS} == BASELINE_KPIS


# --------------------------------------------------------------------------- #
# 13.4 — rotación de flota semanal
# --------------------------------------------------------------------------- #


def _fleet_rows(count: int, vehicle_type: str = "Compactadora") -> list[dict]:
    return [
        {"id": index, "code": f"TR-{index:02d}", "type": vehicle_type}
        for index in range(1, count + 1)
    ]


def test_weekly_rotation_increases_distinct_vehicles():
    """RF-5/AC-3: la rotación usa ≥ 6 vehículos distintos y reparte días justo."""
    fleet = _fleet_rows(8)
    workdays = 5

    def _simulate(rotation: bool) -> dict:
        usage: dict[int, int] = {row["id"]: 0 for row in fleet}
        previous: set[int] = set()
        days: list[dict] = []
        for _ in range(workdays):
            if rotation:
                rest = set(
                    _rotation_rest_ids(
                        fleet, usage, previous, fleet_by_type=None, keep_limit=4
                    )
                )
            else:
                rest = set()
            active = [row for row in fleet if row["id"] not in rest][:4]
            if not rotation:
                active = fleet[:4]
            for row in active:
                usage[row["id"]] += 1
            previous = {row["id"] for row in active}
            days.append(
                {
                    "vehicles": [
                        {"vehicleCode": row["code"], "stops": 3} for row in active
                    ]
                }
            )
        return compute_weekly_rotation_kpis(days)

    rotated = _simulate(True)
    static = _simulate(False)

    assert rotated["distinctVehiclesWeek"] == 8
    assert rotated["distinctVehiclesWeek"] > static["distinctVehiclesWeek"]
    assert rotated["usageStdDays"] <= 1
    assert rotated["rotationIndex"] >= 0.5


def test_weekly_rotation_kpis_synthetic():
    days = [
        {"vehicles": [{"vehicleCode": "TR-01", "stops": 2}, {"vehicleCode": "TR-02", "stops": 0}]},
        {"vehicles": [{"vehicleCode": "TR-01", "stops": 1}, {"vehicleCode": "TR-03", "stops": 4}]},
        {"vehicles": [{"vehicleCode": "TR-02", "stops": 3}]},
    ]

    kpis = compute_weekly_rotation_kpis(days)

    # TR-01 → 2 días, TR-02 → 1 día, TR-03 → 1 día (las rutas sin paradas no cuentan).
    assert kpis["distinctVehiclesWeek"] == 3
    assert kpis["vehicleDaysUsed"] == 4
    assert kpis["usageStdDays"] == pytest.approx(0.47, abs=0.01)
    assert kpis["rotationIndex"] == pytest.approx(0.65, abs=0.01)


def test_weekly_rotation_empty_horizon():
    kpis = compute_weekly_rotation_kpis([])
    assert kpis == {
        "distinctVehiclesWeek": 0,
        "vehicleDaysUsed": 0,
        "usageStdDays": 0.0,
        "rotationIndex": 1.0,
    }


# --------------------------------------------------------------------------- #
# Nivel 2 — aceptación: frontera de Pareto y criterios AC
# --------------------------------------------------------------------------- #


def _run(label, *, km, max_h, active, wb=0.0, wt=0.0, min_active=None, duration=8, uncovered=0):
    return {
        "label": label,
        "durationHours": duration,
        "workloadBalanceWeight": wb,
        "makespanWeight": wt,
        "minActiveVehiclesRequested": min_active,
        "distanceKmOptimized": km,
        "maxRouteHours": max_h,
        "activeVehicles": active,
        "uncoveredPoints": uncovered,
    }


def test_pareto_frontier_excludes_dominated_solutions():
    runs = [
        _run("a", km=100.0, max_h=8.0, active=4),
        _run("b", km=120.0, max_h=6.0, active=6),
        _run("c", km=130.0, max_h=9.0, active=3),  # dominada por «a»
    ]

    labels = [run["label"] for run in build_pareto_frontier(runs)]

    assert sorted(labels) == ["a", "b"]


def test_acceptance_criteria_uses_accepted_operating_point():
    runs = [
        _run("base 8 h (w=0)", km=100.0, max_h=8.5, active=6),
        _run("makespan 2", km=110.0, max_h=7.5, active=6, wt=2.0),
    ]

    result = evaluate_acceptance_criteria(runs)

    assert result["ac2"]["ok"] is True
    assert result["ac2"]["candidates"] == ["makespan 2"]
    assert result["ac1"]["ok"] is True
    assert result["ac1"]["acceptedPoint"]["ratio"] == pytest.approx(1.1)
    assert result["ac1"]["exceptions"] == []


# --------------------------------------------------------------------------- #
# 13.5 — persistencia de ETA
# --------------------------------------------------------------------------- #


def test_eta_persisted_on_collection_waypoints():
    n_customers = 6
    dist, time = vrp_matrix(n_customers, base=100.0)
    vehicles = [_vehicle(1)]
    customers = _customers(n_customers, [5.0] * n_customers)
    solution = RouteSolution(vehicle_routes=[[0, 1, 7, 2, 0]])
    departure_at = datetime(2026, 9, 15, 6, 0, tzinfo=timezone.utc)
    db = MagicMock()

    _persist_routes(
        db,
        1,
        vehicles,
        RouteSolution(),
        solution,
        customers,
        {"current": {}, "optimized": {}},
        dist,
        time,
        unload_seconds=900,
        departure_at=departure_at,
    )

    added = [call.args[0] for call in db.add.call_args_list]
    collection = [
        obj
        for obj in added
        if isinstance(obj, RouteWaypoint) and obj.waypoint_type == "collection"
    ]
    landfill = [
        obj for obj in added if isinstance(obj, RouteWaypoint) and obj.waypoint_type == "landfill"
    ]

    assert len(collection) == 2
    assert all(wp.estimated_arrival_at is not None for wp in collection)
    # Parada 1: 10 s de viaje; parada 2: +60 s ida al vertedero +900 s descarga +50 s viaje.
    assert (collection[0].estimated_arrival_at - departure_at).total_seconds() == pytest.approx(10)
    assert (collection[1].estimated_arrival_at - departure_at).total_seconds() == pytest.approx(2220)
    assert len(landfill) == 1


def test_eta_uses_operational_timezone_offset():
    """La ETA conserva el desfase de la zona horaria operativa (America/Caracas)."""
    n_customers = 6
    dist, time = vrp_matrix(n_customers, base=100.0)
    solution = RouteSolution(vehicle_routes=[[0, 1, 0]])
    departure_at = datetime.fromisoformat("2026-09-15T06:00:00-04:00")
    db = MagicMock()

    _persist_routes(
        db,
        1,
        [_vehicle(1)],
        RouteSolution(),
        solution,
        _customers(n_customers, [5.0] * n_customers),
        {"current": {}, "optimized": {}},
        dist,
        time,
        unload_seconds=900,
        departure_at=departure_at,
    )

    collection = [
        call.args[0]
        for call in db.add.call_args_list
        if isinstance(call.args[0], RouteWaypoint) and call.args[0].waypoint_type == "collection"
    ]
    assert collection
    assert collection[0].estimated_arrival_at.utcoffset() == timedelta(hours=-4)


# --------------------------------------------------------------------------- #
# Decisiones de política (Fase 13): territorios y zona horaria
# --------------------------------------------------------------------------- #


def test_resolve_sector_partition_priority():
    """El multiobjetivo prefiere el reparto global salvo que el llamador lo fuerce."""
    assert resolve_sector_partition(True, auto_applies=True, objective_requested=True) == (True, False)
    assert resolve_sector_partition(False, auto_applies=True, objective_requested=False) == (False, False)
    assert resolve_sector_partition(None, auto_applies=True, objective_requested=True) == (False, True)
    assert resolve_sector_partition(None, auto_applies=True, objective_requested=False) == (True, False)
    assert resolve_sector_partition(None, auto_applies=False, objective_requested=True) == (False, False)


def test_resolve_operational_timezone_defaults_to_caracas():
    assert str(resolve_operational_timezone(mock_db_with_settings())) == "America/Caracas"


def test_resolve_operational_timezone_invalid_falls_back_to_utc():
    db = mock_db_with_settings(
        settings_blob={"operational": {"timezone": "Mars/Phobos"}, "integrations": {}}
    )
    assert resolve_operational_timezone(db) == timezone.utc


def test_operational_departure_at_is_local_wall_clock():
    """El reloj operativo es hora local de la zona configurada, no UTC."""
    from app.domain.operational_clock import operational_departure_at

    departure = operational_departure_at(date(2026, 9, 15), "06:00")
    assert departure.hour == 6
    assert departure.utcoffset() == timedelta(hours=-4)

    # Desfase del seed de demo (06:15) sobre el inicio de jornada.
    assert operational_departure_at(date(2026, 9, 15), "06:00", extra_minutes=15).minute == 15

    # Zona inválida → UTC, sin romper la llamada.
    fallback = operational_departure_at(date(2026, 9, 15), "06:00", timezone_name="Mars/Phobos")
    assert fallback.utcoffset() == timedelta(0)


# --------------------------------------------------------------------------- #
# 13.7 — contrato del flujo diario que alimenta el panel de la UI
# --------------------------------------------------------------------------- #


def test_resolve_shift_hours_request_wins_then_algorithm_default():
    """Fase 13: la jornada de la corrida manda; si no, el default del algoritmo."""
    assert resolve_shift_hours(8, 6) == 8
    assert resolve_shift_hours(None, 6) == 6
    assert resolve_shift_hours(None, None) is None
    # Fuera del rango 1–12 se degrada a la jornada de la instalación (no al default).
    assert resolve_shift_hours(None, 20) is None
    assert resolve_shift_hours(0, 6) is None


def test_daily_optimize_request_accepts_objective_parameters():
    """El endpoint del día (usado por la UI) acepta el objetivo multiobjetivo."""
    from pydantic import ValidationError

    from app.schemas.route_constraints import DailyOptimizeRequest

    body = DailyOptimizeRequest(
        workloadBalanceWeight=1.5,
        makespanWeight=2,
        minActiveVehicles=3,
        maxRouteHoursTarget=8,
        estimatedDurationHours=8,
    )
    assert body.workload_balance_weight == 1.5
    assert body.makespan_weight == 2.0
    assert body.min_active_vehicles == 3
    assert body.max_route_hours_target == 8.0
    assert body.estimated_duration_hours == 8

    # El contrato del motor admite hasta 10; la UI es la que acota a 3.
    assert DailyOptimizeRequest(workloadBalanceWeight=10).workload_balance_weight == 10.0
    with pytest.raises(ValidationError):
        DailyOptimizeRequest(workloadBalanceWeight=11)
    with pytest.raises(ValidationError):
        DailyOptimizeRequest(minActiveVehicles=0)
    with pytest.raises(ValidationError):
        DailyOptimizeRequest(estimatedDurationHours=13)


# --------------------------------------------------------------------------- #
# 13.8 — decisiones de alcance: rebose como KPI y semilla reproducible
# --------------------------------------------------------------------------- #


def test_solution_overflow_kg_counts_unserved_and_is_unweighted():
    """D1: el KPI de rebose reusa la fórmula del objetivo, pero sin peso (kg crudos)."""
    n_customers = 3
    _dist, time = vrp_matrix(n_customers, base=1000.0)
    landfill_idx = n_customers + 1
    deadline = [0.0] * n_customers
    rate = [10.0] * n_customers

    base_kwargs = {
        "landfill_idx": landfill_idx,
        "unload_sec": 0.0,
        "shift_budget_sec": 3600.0,
        "deadline_sec": deadline,
        "rate_kg_per_hour": rate,
    }

    # Sin rutas activas todos quedan sin atender y rebosan hasta el fin de jornada:
    # 10 kg/h × 1 h × 3 contenedores.
    unserved_kg = solution_overflow_kg([], time, services=[], **base_kwargs)
    assert unserved_kg == pytest.approx(30.0)

    route = [0, 1, 2, 3, landfill_idx, 0]
    served_kg = solution_overflow_kg([route], time, services=[0.0], **base_kwargs)
    assert served_kg > 0.0

    # El KPI no lleva peso: al duplicar la tasa, el rebose se duplica.
    doubled = solution_overflow_kg(
        [route], time, services=[0.0], **{**base_kwargs, "rate_kg_per_hour": [20.0] * n_customers}
    )
    assert doubled == pytest.approx(2 * served_kg)

    # Deadline lejano ⇒ nadie rebosa dentro de la jornada.
    far = solution_overflow_kg(
        [route],
        time,
        services=[0.0],
        **{**base_kwargs, "deadline_sec": [10**9] * n_customers},
    )
    assert far == 0.0


def test_optimization_job_serializes_seed_for_reproducible_sweeps():
    """Pendiente 6: la semilla viaja job → params del motor."""
    from app.services.optimization_job_service import OptimizationJob, _serialize_params

    job = OptimizationJob(
        id="job-seed",
        status="pending",
        scenario_id="normal",
        rain_intensity=None,
        waste_level_pct=None,
        estimated_duration_hours=None,
        seed=1234,
    )
    payload = json.loads(_serialize_params(job))
    assert payload["seed"] == 1234

    # Sin semilla no se contamina el payload (se conserva el default 42 del motor).
    no_seed = json.loads(
        _serialize_params(
            OptimizationJob(
                id="job-no-seed",
                status="pending",
                scenario_id="normal",
                rain_intensity=None,
                waste_level_pct=None,
                estimated_duration_hours=None,
            )
        )
    )
    assert "seed" not in no_seed


def test_optimize_request_accepts_seed():
    """Pendiente 6: el endpoint admite la semilla como parámetro opcional del motor."""
    from app.schemas.simulation import OptimizeRequest

    assert OptimizeRequest(seed=7).seed == 7
    assert OptimizeRequest().seed is None


def test_optimize_request_accepts_aco_hyperparameters():
    """Opción (a): α/β/ρ/Q viajan por corrida y validan su rango en el esquema."""
    from pydantic import ValidationError

    from app.schemas.simulation import OptimizeRequest

    body = OptimizeRequest(acoAlpha=2, acoBeta=5, acoRho=0.3, pheromoneQ=0.5)
    assert body.aco_alpha == 2.0
    assert body.aco_beta == 5.0
    assert body.aco_rho == 0.3
    assert body.pheromone_q == 0.5

    # Sin valor, el motor cae al default de Administración.
    assert OptimizeRequest().aco_alpha is None
    assert OptimizeRequest().pheromone_q is None

    # Fuera de rango: ρ ∈ (0, 1], α > 0, β ≥ 0, Q > 0.
    with pytest.raises(ValidationError):
        OptimizeRequest(acoRho=1.5)
    with pytest.raises(ValidationError):
        OptimizeRequest(acoRho=0)
    with pytest.raises(ValidationError):
        OptimizeRequest(acoAlpha=0)
    with pytest.raises(ValidationError):
        OptimizeRequest(acoBeta=-1)


def test_optimization_job_serializes_aco_hyperparameters():
    """Opción (a): los hiperparámetros del barrido se persisten con el job."""
    from app.services.optimization_job_service import OptimizationJob, _serialize_params

    job = OptimizationJob(
        id="job-hyper",
        status="pending",
        scenario_id="normal",
        rain_intensity=None,
        waste_level_pct=None,
        estimated_duration_hours=None,
        aco_alpha=1.5,
        aco_beta=4.0,
        aco_rho=0.2,
        pheromone_q=2.0,
    )
    payload = json.loads(_serialize_params(job))
    assert payload["aco_alpha"] == 1.5
    assert payload["aco_beta"] == 4.0
    assert payload["aco_rho"] == 0.2
    assert payload["pheromone_q"] == 2.0


def test_sensitivity_sweep_covers_hyperparameters_in_three_levels():
    """Opción (a): el barrido cubre los 4 ejes α/β/ρ/Q con 3 niveles cada uno."""
    from app.services.aco_sensitivity_service import (
        ANT_SENSITIVITY_SERIES,
        HYPERPARAMETER_SENSITIVITY_SERIES,
        ITERATION_SENSITIVITY_SERIES,
        STANDARD_HYPERPARAMETERS,
    )

    keys = ("acoAlpha", "acoBeta", "acoRho", "pheromoneQ")
    axes = {case["axis"] for case in HYPERPARAMETER_SENSITIVITY_SERIES}
    assert axes == {"alpha", "beta", "rho", "q"}
    for axis in axes:
        levels = [case for case in HYPERPARAMETER_SENSITIVITY_SERIES if case["axis"] == axis]
        assert len(levels) == 3
    assert all(key in STANDARD_HYPERPARAMETERS for key in keys)

    # Las series de hormigas/iteraciones no fijan hiperparámetros: usan el default.
    for case in [*ANT_SENSITIVITY_SERIES, *ITERATION_SENSITIVITY_SERIES]:
        assert not any(key in case for key in keys)
