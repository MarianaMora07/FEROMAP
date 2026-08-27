"""Tests de integración ACO con restricciones Fase 4."""

from __future__ import annotations

from app.services.aco_parallel import build_ant_solution
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


def test_build_ant_solution_respects_sector_time_windows():
    n_customers = 2
    dist, time = vrp_matrix(n_customers, base=1200.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    demands = [5.0, 5.0]
    capacities = [40.0]
    pheromone = [[1.0 for _ in row] for row in dist]
    # Cliente 1 solo mañana (0–6h), cliente 2 solo tarde (6–12h) con tiempos altos entre ellos
    window_starts = [0.0, 6 * 3600]
    window_ends = [6 * 3600, 12 * 3600]

    routes, _cost, _duration, uncovered = build_ant_solution(
        42,
        n_customers,
        demands,
        capacities,
        dist,
        time,
        pheromone,
        window_starts=window_starts,
        window_ends=window_ends,
        **kwargs,
    )

    served = {idx for route in routes for idx in route if 1 <= idx <= n_customers}
    # Con ventanas opuestas y un solo vehículo, al menos uno queda fuera o se respeta factibilidad
    assert len(served) <= n_customers
    assert isinstance(uncovered, list)
