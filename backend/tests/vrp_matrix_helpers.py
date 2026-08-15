"""Helpers de matriz VRP multi-viaje (depósito + clientes + vertedero)."""

from __future__ import annotations


def vrp_matrix(n_customers: int, base: float = 100.0) -> tuple[list[list[float]], list[list[float]]]:
    """Matriz (N+2)×(N+2): índice 0 depósito, 1..N clientes, N+1 vertedero."""
    n = n_customers + 2
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d = base * abs(i - j)
            dist[i][j] = d
            time[i][j] = d / 10
    return dist, time


def aco_multi_trip_kwargs(n_customers: int, n_vehicles: int) -> dict:
    return {
        "landfill_idx": n_customers + 1,
        "shift_budget_sec": 43_200.0,
        "unload_sec": 900.0,
        "service_secs": [300.0] * max(1, n_vehicles),
    }
