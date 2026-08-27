"""Restricciones operativas ligeras para el motor ACO (Fase 4)."""

from __future__ import annotations

from typing import Any

FILL_LEVEL_CRITICAL_PCT = 80
FILL_LEVEL_HIGH_PCT = 60

# Ventanas amplias por sector (segundos desde inicio de jornada 06:00)
MORNING_WINDOW = (0, 6 * 3600)  # 06:00–12:00
AFTERNOON_WINDOW = (6 * 3600, 12 * 3600)  # 12:00–18:00


def fill_level_distance_factor(fill_pct: int) -> float:
    """Factor multiplicador en matriz heurística (<1 = más atractivo para el ACO)."""
    if fill_pct >= FILL_LEVEL_CRITICAL_PCT:
        return 0.70
    if fill_pct >= FILL_LEVEL_HIGH_PCT:
        return 0.90
    return 1.0


def sector_time_window_secs(sector_id: int | None) -> tuple[int, int]:
    """Asigna ventana mañana/tarde según sector (VRPTW light)."""
    if sector_id is None:
        return MORNING_WINDOW
    if sector_id % 2 == 0:
        return MORNING_WINDOW
    return AFTERNOON_WINDOW


def build_fill_level_heuristic_matrix(
    dist_matrix: list[list[float]],
    fill_pcts: list[int],
    *,
    enabled: bool,
) -> list[list[float]]:
    """Reduce costos heurísticos hacia contenedores con llenado alto."""
    if not enabled or not fill_pcts:
        return dist_matrix
    n = len(dist_matrix)
    heuristic = [row[:] for row in dist_matrix]
    for customer_idx, fill_pct in enumerate(fill_pcts, start=1):
        factor = fill_level_distance_factor(fill_pct)
        if factor >= 1.0:
            continue
        if customer_idx >= n:
            break
        for i in range(n):
            heuristic[i][customer_idx] *= factor
    return heuristic


def build_customer_time_windows(
    sector_ids: list[int | None],
    *,
    enabled: bool,
) -> tuple[list[float] | None, list[float] | None]:
    if not enabled:
        return None, None
    starts: list[float] = []
    ends: list[float] = []
    for sector_id in sector_ids:
        window_start, window_end = sector_time_window_secs(sector_id)
        starts.append(float(window_start))
        ends.append(float(window_end))
    return starts, ends


def is_visit_feasible_with_window(
    elapsed: float,
    current: int,
    chosen: int,
    service_sec: float,
    time_matrix: list[list[float]],
    *,
    window_start: float,
    window_end: float,
    shift_budget_sec: float | None,
) -> bool:
    """Valida que la visita quepa en la ventana del sector y en la jornada."""
    travel = time_matrix[current][chosen]
    arrival = elapsed + travel
    start_service = max(arrival, window_start)
    finish = start_service + service_sec
    if shift_budget_sec is not None and finish > shift_budget_sec:
        return False
    return finish <= window_end + 1e-6


def elapsed_after_visit(
    elapsed: float,
    current: int,
    chosen: int,
    service_sec: float,
    time_matrix: list[list[float]],
    *,
    window_start: float | None = None,
) -> float:
    travel = time_matrix[current][chosen]
    arrival = elapsed + travel
    if window_start is not None:
        arrival = max(arrival, window_start)
    return arrival + service_sec


def build_applied_route_constraints(
    *,
    priority_fill_level: bool,
    time_window_enabled: bool,
    kpi_view: str,
) -> dict[str, Any]:
    return {
        "priorityFillLevel": priority_fill_level,
        "timeWindowEnabled": time_window_enabled,
        "kpiView": kpi_view,
        "timeWindowModel": "sector_morning_afternoon" if time_window_enabled else None,
        "fillLevelThresholdPct": FILL_LEVEL_CRITICAL_PCT if priority_fill_level else None,
    }
