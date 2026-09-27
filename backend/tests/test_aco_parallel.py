"""Tests de paralelismo ACO (hormigas)."""

from __future__ import annotations

import pytest

from app.services.aco_parallel import (
    SHIFT_OVERFLOW_PENALTY,
    _close_route,
    _default_distance_reference_m,
    _objective_cost,
    _shift_overflow_penalty,
    _two_opt,
    build_ant_solution,
    resolve_aco_parallel_workers,
    run_ant_solutions,
)
from app.services.optimization_service import _aco_cvrp
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


@pytest.fixture(autouse=True)
def sequential_ants_in_tests(monkeypatch):
    monkeypatch.setattr("app.services.optimization_service.settings.aco_parallel_workers", 1)


def test_resolve_aco_parallel_workers_auto_and_explicit(monkeypatch):
    monkeypatch.setattr("app.services.aco_parallel.settings.aco_parallel_workers", 0)
    assert resolve_aco_parallel_workers(12) >= 1

    monkeypatch.setattr("app.services.aco_parallel.settings.aco_parallel_workers", 1)
    assert resolve_aco_parallel_workers(12) == 1

    monkeypatch.setattr("app.services.aco_parallel.settings.aco_parallel_workers", 4)
    assert resolve_aco_parallel_workers(12) == 4
    assert resolve_aco_parallel_workers(2) == 2


def test_build_ant_solution_returns_feasible_routes():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    routes, cost, duration, uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        **kwargs,
    )

    assert routes
    assert cost > 0
    assert duration > 0
    assert uncovered == []


def test_run_ant_solutions_parallel_matches_sequential_count(monkeypatch):
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]
    seeds = [1, 2, 3, 4]

    sequential = run_ant_solutions(
        ant_seeds=seeds,
        n_customers=n_customers,
        demands=demands,
        capacities=capacities,
        dist_matrix=dist,
        time_matrix=time,
        pheromone=pheromone,
        max_workers=1,
        **kwargs,
    )

    parallel = run_ant_solutions(
        ant_seeds=seeds,
        n_customers=n_customers,
        demands=demands,
        capacities=capacities,
        dist_matrix=dist,
        time_matrix=time,
        pheromone=pheromone,
        max_workers=2,
        **kwargs,
    )

    assert len(sequential) == len(parallel) == 4
    assert all(cost > 0 for _routes, cost, _dur, _unc in parallel)


def test_aco_cvrp_parallel_workers_recorded(monkeypatch):
    monkeypatch.setattr("app.services.optimization_service.settings.aco_parallel_workers", 2)
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=4,
        aco_iterations=3,
        aco_patience=0,
        seed=7,
        **kwargs,
    )

    assert solution.distance_m > 0
    assert solution.aco_parallel_workers == 2


def test_overflow_penalty_increases_cost():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=1200.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    def _run(**overflow_kwargs):
        return build_ant_solution(
            42,
            n_customers,
            demands,
            capacities,
            dist,
            time,
            pheromone,
            **kwargs,
            **overflow_kwargs,
        )

    _routes, base_cost, _dur, _unc = _run()
    _routes2, penalized_cost, _dur2, _unc2 = _run(
        overflow_deadline_sec=[0.0] * n_customers,
        overflow_rate_kg_per_hour=[100.0] * n_customers,
        overflow_weight=1.0,
    )

    assert penalized_cost > base_cost


def test_aco_cvrp_overflow_does_not_inflate_reported_distance():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=900.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    plain = _aco_cvrp(n_customers, demands, capacities, dist, time, seed=11, **kwargs)
    penalized = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        seed=11,
        overflow_deadline_sec=[0.0] * n_customers,
        overflow_rate_kg_per_hour=[100.0] * n_customers,
        overflow_weight=500.0,
        **kwargs,
    )

    # La distancia reportada es pura (sin penalización), aunque la búsqueda cambie:
    # con peso 500 la penalización sería del orden de cientos de miles de metros.
    assert penalized.distance_m > 0
    assert plain.distance_m < 100_000
    assert penalized.distance_m < 100_000


def test_aco_cvrp_accepts_custom_hyperparameters():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        seed=3,
        alpha=1.5,
        beta=2.0,
        rho=0.2,
        two_opt_passes=3,
        at_risk_multiplier=2.0,
        critical_multiplier=1.5,
        high_multiplier=1.2,
        **kwargs,
    )

    assert solution.distance_m > 0
    assert solution.uncovered_customer_indices == []


def test_build_ant_solution_accepts_multiplier_and_opt_overrides():
    n_customers = 3
    demands = [4.0, 4.0, 4.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=90.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    pheromone = [[1.0 for _ in range(n_customers + 2)] for _ in range(n_customers + 2)]

    routes, cost, _duration, uncovered = build_ant_solution(
        7,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        alpha=2.0,
        beta=1.0,
        two_opt_passes=2,
        at_risk_multiplier=1.8,
        critical_multiplier=1.4,
        high_multiplier=1.15,
        **kwargs,
    )

    assert routes
    assert cost > 0
    assert uncovered == []


def test_aco_cvrp_accepts_pheromone_q_and_elitist():
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        seed=5,
        pheromone_q=2.0,
        pheromone_elitist=True,
        **kwargs,
    )

    assert solution.distance_m > 0
    assert solution.uncovered_customer_indices == []


# --------------------------------------------------------------------------- #
# Fase 13.3 — factibilidad de cierre, shim de jornada y alineación por vehículo
# --------------------------------------------------------------------------- #


def test_close_route_reports_over_budget():
    """El regreso a base fuera de jornada ya no se silencia: se reporta el exceso."""
    _dist, time = vrp_matrix(1, base=100.0)
    closed, _current, _elapsed, over = _close_route(
        [0, 1],
        current=1,
        load=0.0,
        elapsed=100.0,
        landfill_idx=2,
        time_matrix=time,
        unload_sec=900.0,
        shift_budget_sec=105.0,
    )

    # Sigue regresando (no se deja el camión varado), pero se reporta el exceso.
    # Vuelta al depósito: 100 s transcurridos + 10 s de viaje = 110 s.
    assert closed == [0, 1, 0]
    assert over == pytest.approx(5.0)


def test_close_route_within_budget_reports_zero():
    _dist, time = vrp_matrix(1, base=100.0)
    _closed, _current, _elapsed, over = _close_route(
        [0, 1],
        current=1,
        load=0.0,
        elapsed=100.0,
        landfill_idx=2,
        time_matrix=time,
        unload_sec=900.0,
        shift_budget_sec=200.0,
    )
    assert over == 0.0


def test_shift_overflow_penalty_scales_with_overage():
    assert _shift_overflow_penalty(0.0, 43_200.0) == 0.0
    # Una jornada completa de exceso equivale a la barrera nominal.
    assert _shift_overflow_penalty(3600.0, 3600.0) == pytest.approx(SHIFT_OVERFLOW_PENALTY)
    assert _shift_overflow_penalty(1800.0, 3600.0) == pytest.approx(SHIFT_OVERFLOW_PENALTY / 2)


def test_two_opt_rejects_reversal_that_breaks_window():
    """El 2-opt ya no degrada una ruta factible a infactible por ganar distancia."""
    # 0 depósito, 1 y 2 clientes, 3 vertedero (sin uso). Matriz asimétrica.
    dist = [
        [0.0, 10.0, 1.0, 0.0],
        [1.0, 0.0, 1.0, 0.0],
        [10.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
    ]
    time = [
        [0.0, 1.0, 1.0, 0.0],
        [1.0, 0.0, 1.0, 0.0],
        [1.0, 60.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0],
    ]
    route = [0, 1, 2, 0]

    # Sin restricciones solo manda la distancia: el intercambio 1↔2 ahorra 18.
    assert _two_opt(route, dist, landfill_idx=3) == [0, 2, 1, 0]

    # Con ventanas, invertir hace llegar al cliente 1 a los 61 s (ventana ≤ 1 s).
    guarded = _two_opt(
        route,
        dist,
        landfill_idx=3,
        time_matrix=time,
        service_sec=0.0,
        unload_sec=0.0,
        shift_budget_sec=10_000.0,
        window_starts=[0.0, 0.0],
        window_ends=[1.0, 2.0],
    )
    assert guarded == [0, 1, 2, 0]


def test_build_ant_solution_returns_one_route_per_vehicle():
    """Una entrada por vehículo para que service_secs/capacities sigan alineados."""
    n_customers = 2
    demands = [5.0, 5.0]
    capacities = [30.0, 30.0, 30.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 3)
    pheromone = [[1.0] * (n_customers + 2) for _ in range(n_customers + 2)]

    routes, _cost, _duration, uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        **kwargs,
    )

    assert len(routes) == len(capacities)
    assert uncovered == []


def test_sequential_builder_never_closes_outside_shift():
    """La construcción no agrega paradas desde las que no se pueda volver a base.

    Mismo criterio de jornada que la construcción balanceada y el local search: sin la
    pata de regreso, el constructor secuencial cerraba rutas fuera del turno.
    """
    n_customers = 2
    demands = [5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = {
        "landfill_idx": n_customers + 1,
        "shift_budget_sec": 1215.0,
        "unload_sec": 900.0,
        "service_secs": [1200.0],
    }
    pheromone = [[1.0] * (n_customers + 2) for _ in range(n_customers + 2)]

    routes, cost, _duration, uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        **kwargs,
    )

    # Depósito → cliente → depósito cuesta 1220 s, más que los 1215 s de jornada.
    assert all(len(route) <= 2 for route in routes)
    assert sorted(uncovered) == [1, 2]
    assert cost == pytest.approx(0.0)


def test_aco_cvrp_reports_real_vehicle_indices():
    """Un vehículo saltado en medio no debe romper la atribución de rutas.

    El del medio no cabe por capacidad, así que las rutas activas son de los vehículos
    0 y 2: su posición en ``vehicle_routes`` no coincide con el índice real.
    """
    n_customers = 4
    demands = [10.0, 10.0, 10.0, 10.0]
    capacities = [20.0, 5.0, 20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 3)
    kwargs["shift_budget_sec"] = 2500.0

    solution = _aco_cvrp(
        n_customers,
        demands,
        capacities,
        dist,
        time,
        aco_ants=4,
        aco_iterations=3,
        aco_patience=0,
        seed=7,
        **kwargs,
    )

    assert solution.vehicle_indices is not None
    assert len(solution.vehicle_indices) == len(solution.vehicle_routes)
    assert 1 not in solution.vehicle_indices
    assert solution.vehicle_indices == [0, 2]


def test_builder_cost_equals_objective_cost_with_overflow():
    """El rebose entra por ``_objective_cost``: nadie lo acumula por fuera.

    Es la garantía de que ``_rebalance_pass`` y la comparación final de la corrida no
    vuelvan a puntuar sin el rebose que las hormigas sí ven.
    """
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = {
        "landfill_idx": n_customers + 1,
        "shift_budget_sec": 43_200.0,
        "unload_sec": 900.0,
        "service_secs": [1200.0],
    }
    overflow_kwargs = {
        "overflow_deadline_sec": [0.0] * n_customers,
        "overflow_rate_kg_per_hour": [100.0] * n_customers,
        "overflow_weight": 1.0,
    }
    pheromone = [[1.0] * (n_customers + 2) for _ in range(n_customers + 2)]

    routes, cost, _duration, _uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        **kwargs,
        **overflow_kwargs,
    )

    assert cost == pytest.approx(
        _objective_cost(routes, dist, time, **kwargs, **overflow_kwargs)
    )
    # Con la misma ruta, apagar el peso del rebose abarata el costo.
    assert cost > _objective_cost(routes, dist, time, **kwargs)


def test_builder_cost_is_objective_cost_only():
    """El builder no suma nada fuera de ``_objective_cost``: una sola fuente de costo."""
    n_customers = 4
    demands = [5.0, 5.0, 5.0, 5.0]
    capacities = [20.0]
    dist, time = vrp_matrix(n_customers, base=100.0)
    kwargs = {
        "landfill_idx": n_customers + 1,
        "shift_budget_sec": 3650.0,
        "unload_sec": 900.0,
        "service_secs": [1200.0],
    }
    pheromone = [[1.0] * (n_customers + 2) for _ in range(n_customers + 2)]

    routes, cost, _duration, _uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        **kwargs,
    )

    assert cost == pytest.approx(_objective_cost(routes, dist, time, **kwargs))
    assert cost >= sum(
        dist[i][j] for r in routes for i, j in zip(r[:-1], r[1:])
    ) / _default_distance_reference_m(dist)
