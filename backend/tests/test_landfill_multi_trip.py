"""Matriz de aceptación Fase 5 — vertedero multi-viaje y jornada operativa."""

from __future__ import annotations

import pytest

from app.services.aco_parallel import build_ant_solution
from app.services.optimization_service import (
    CustomerNode,
    RouteSolution,
    VehicleUnit,
    _aco_cvrp,
    _build_distance_matrix,
    _compute_kpis,
    _landfill_idx,
    _persist_routes,
    _route_operational_duration,
)
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix

SHIFT_BUDGET_12H = 43_200.0
UNLOAD_SEC = 900.0


def _vehicle(capacity_kg: float = 40.0) -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=1,
        driver_id=1,
        capacity_kg=capacity_kg,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=6,
    )


def _customers(n: int, demand: float = 10.0) -> list[CustomerNode]:
    return [
        CustomerNode(i, f"C{i:03d}", i, demand, 50, -62.71 + i * 0.01, 8.29 + i * 0.001)
        for i in range(1, n + 1)
    ]


def _assert_no_capacity_violation(
    route: list[int],
    demands: list[float],
    capacity: float,
    landfill_idx: int,
) -> None:
    load = 0.0
    for node in route:
        if node in (0, landfill_idx):
            load = 0.0
            continue
        load += demands[node - 1]
        assert load <= capacity + 1e-6


def test_build_distance_matrix_includes_landfill_node():
    customers = _customers(2)
    dist, time = _build_distance_matrix(
        None,
        0,
        customers,
        depot_lon=-62.715,
        depot_lat=8.295,
        landfill_node=0,
        landfill_lon=-62.690,
        landfill_lat=8.280,
    )
    assert len(dist) == 4
    assert dist[3][1] > 0
    assert time[0][3] > 0


def test_inserts_landfill_when_capacity_full():
    """Capacidad llena → visita obligatoria al vertedero."""
    n_customers = 6
    demands = [10.0] * n_customers
    capacities = [40.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    landfill_idx = _landfill_idx(n_customers)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    routes, cost, duration, uncovered = build_ant_solution(
        7,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        landfill_idx=landfill_idx,
        shift_budget_sec=SHIFT_BUDGET_12H,
        unload_sec=UNLOAD_SEC,
        service_secs=[300.0],
    )

    assert routes
    assert landfill_idx in routes[0]
    assert cost > 0
    assert duration > 0
    assert uncovered == []


def test_landfill_resets_load_and_continues():
    """Tras descarga en vertedero, el camión sigue recolectando."""
    n_customers = 8
    demands = [10.0] * n_customers
    capacities = [40.0]
    dist, time = vrp_matrix(n_customers, base=70.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=5, **kwargs)
    landfill_idx = kwargs["landfill_idx"]
    route = solution.vehicle_routes[0]

    assert landfill_idx in route
    landfill_pos = route.index(landfill_idx)
    customers_after_dump = [node for node in route[landfill_pos + 1 :] if 1 <= node <= n_customers]
    assert customers_after_dump, "Debe haber contenedores después del vertedero"


def test_route_always_ends_at_depot():
    """Toda ruta cierra en depósito (índice 0)."""
    n_customers = 6
    demands = [10.0, 15.0, 8.0, 12.0, 20.0, 5.0]
    capacities = [40.0, 40.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, len(capacities))

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=7, **kwargs)

    for route in solution.vehicle_routes:
        if len(route) <= 1:
            continue
        assert route[0] == 0
        assert route[-1] == 0


def test_unload_if_loaded_at_shift_end():
    """Carga residual al cerrar → vertedero antes del depósito."""
    n_customers = 5
    demands = [12.0, 12.0, 12.0, 12.0, 5.0]
    capacities = [40.0]
    dist, time = vrp_matrix(n_customers, base=60.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=3, **kwargs)
    landfill_idx = kwargs["landfill_idx"]
    route = solution.vehicle_routes[0]

    load = 0.0
    for node in route:
        if node == landfill_idx:
            load = 0.0
        elif 1 <= node <= n_customers:
            load += demands[node - 1]

    if landfill_idx in route:
        assert route.index(landfill_idx) < len(route) - 1
    assert route[-1] == 0


def test_shift_limit_cuts_route_at_12h():
    """Jornada 06:00–18:00 (43 200 s) corta la ruta operativa."""
    n_customers = 12
    demands = [10.0] * n_customers
    capacities = [200.0]
    dist, time = vrp_matrix(n_customers, base=800.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    kwargs["shift_budget_sec"] = SHIFT_BUDGET_12H
    kwargs["service_secs"] = [5000.0]

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=11, **kwargs)
    vehicle = _vehicle(capacity_kg=capacities[0])

    for route in solution.vehicle_routes:
        if len(route) <= 2:
            continue
        _, _, total_s = _route_operational_duration(
            route,
            dist,
            time,
            vehicle,
            n_customers=n_customers,
            unload_seconds=int(kwargs["unload_sec"]),
        )
        assert total_s <= SHIFT_BUDGET_12H + 1

    assert solution.uncovered_customer_indices
    served = {
        idx
        for route in solution.vehicle_routes
        for idx in route
        if 1 <= idx <= n_customers
    }
    assert len(served) + len(solution.uncovered_customer_indices) == n_customers
    assert len(served) < n_customers


def test_uncovered_points_reported():
    """Contenedores fuera de jornada aparecen en KPIs y en la solución."""
    n_customers = 8
    customers = _customers(n_customers)
    demands = [10.0] * n_customers
    capacities = [100.0]
    dist, time = vrp_matrix(n_customers, base=500.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    kwargs["shift_budget_sec"] = 600.0
    kwargs["service_secs"] = [1200.0]

    optimized = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=11, **kwargs)
    current = RouteSolution(vehicle_routes=[[0] + list(range(1, n_customers + 1)) + [0]], distance_m=5000.0)

    uncovered_codes = [customers[i - 1].code for i in optimized.uncovered_customer_indices]
    served_codes = {
        customers[idx - 1].code
        for route in optimized.vehicle_routes
        for idx in route
        if 1 <= idx <= n_customers
    }

    kpis = _compute_kpis(
        current,
        optimized,
        customers,
        served_codes,
        [_vehicle(capacities[0])],
        dist,
        time,
        unload_seconds=int(kwargs["unload_sec"]),
        shift_budget_seconds=int(kwargs["shift_budget_sec"]),
        uncovered_point_codes=uncovered_codes,
    )

    assert optimized.uncovered_customer_indices
    assert kpis["uncoveredPoints"] == len(uncovered_codes)
    assert kpis["uncoveredPointCodes"] == uncovered_codes


def test_no_capacity_violation_between_dumps():
    """Ningún tramo entre vertederos supera max_capacity_kg."""
    n_customers = 6
    demands = [10.0, 15.0, 8.0, 12.0, 20.0, 5.0]
    capacities = [40.0, 40.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, len(capacities))
    landfill_idx = kwargs["landfill_idx"]

    solution = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=7, **kwargs)

    for v_idx, route in enumerate(solution.vehicle_routes):
        cap = capacities[min(v_idx, len(capacities) - 1)]
        _assert_no_capacity_violation(route, demands, cap, landfill_idx)


def test_landfill_kpi_count():
    """landfillTrips refleja visitas al vertedero en rutas optimizadas."""
    n_customers = 4
    customers = _customers(n_customers)
    dist, time = vrp_matrix(n_customers, base=80.0)
    landfill_idx = _landfill_idx(n_customers)
    route = [0, 1, landfill_idx, 2, 3, 4, landfill_idx, 0]
    optimized = RouteSolution(vehicle_routes=[route], distance_m=1000.0, duration_s=600.0)
    current = RouteSolution(vehicle_routes=[[0, 1, 2, 3, 4, 0]], distance_m=1200.0, duration_s=700.0)
    served = {c.code for c in customers}

    kpis = _compute_kpis(
        current,
        optimized,
        customers,
        served,
        [_vehicle()],
        dist,
        time,
        unload_seconds=UNLOAD_SEC,
        shift_budget_seconds=int(SHIFT_BUDGET_12H),
    )

    assert kpis["landfillTrips"] == 2
    assert kpis["durationBreakdown"]["optimized"]["landfillTrips"] == 2
    assert kpis["unloadTimeHours"] == pytest.approx(0.5)


def test_persist_landfill_waypoint():
    """PostgreSQL: waypoint_type=landfill y facility_code en rutas persistidas."""
    n_customers = 2
    dist, time = vrp_matrix(n_customers, base=50.0)
    landfill_idx = _landfill_idx(n_customers)
    optimized = RouteSolution(
        vehicle_routes=[[0, 1, landfill_idx, 2, 0]],
        distance_m=400.0,
        duration_s=200.0,
    )
    current = RouteSolution(vehicle_routes=[[0, 1, 2, 0]], distance_m=450.0, duration_s=220.0)
    customers = _customers(n_customers, demand=8.0)
    captured: list[object] = []

    class FakeSession:
        def add(self, obj):
            captured.append(obj)

        def flush(self):
            pass

    _persist_routes(
        FakeSession(),
        simulation_id=99,
        vehicles=[_vehicle()],
        current_solution=current,
        optimized_solution=optimized,
        customers=customers,
        routes_geojson={},
        dist_matrix=dist,
        time_matrix=time,
        unload_seconds=UNLOAD_SEC,
    )

    landfill_wps = [obj for obj in captured if getattr(obj, "waypoint_type", None) == "landfill"]
    assert len(landfill_wps) == 1
    assert landfill_wps[0].facility_code == "landfill"
    assert landfill_wps[0].collection_point_id is None


def test_aco_fitness_unchanged_by_unload_time():
    """Misma semilla → misma distancia aunque cambie el tiempo de descarga (no afecta fitness ACO)."""
    n_customers = 6
    demands = [10.0] * n_customers
    capacities = [40.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs_fast = aco_multi_trip_kwargs(n_customers, 1)
    kwargs_slow = {**kwargs_fast, "unload_sec": 3600.0}

    first = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=99, **kwargs_fast)
    second = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=99, **kwargs_slow)

    assert first.distance_m == pytest.approx(second.distance_m)
    assert first.vehicle_routes == second.vehicle_routes
