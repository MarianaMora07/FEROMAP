"""Restricciones operativas ligeras para el motor ACO (Fase 4)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.domain.criticality import CRITICAL_FILL_PCT, HIGH_FILL_PCT
from app.domain.zone_window import DAY_WINDOW_SECONDS

# Alias al dominio: una sola fuente de verdad para los umbrales de llenado.
FILL_LEVEL_CRITICAL_PCT = CRITICAL_FILL_PCT
FILL_LEVEL_HIGH_PCT = HIGH_FILL_PCT

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
    """Ventana mañana/tarde por paridad de sector.

    **Legado (F8):** se conserva solo como respaldo cuando el llamador no aporta la
    configuración por zona. El motor real usa `zone_config_service.sector_windows`.
    """
    if sector_id is None:
        return MORNING_WINDOW
    if sector_id % 2 == 0:
        return MORNING_WINDOW
    return AFTERNOON_WINDOW


def _resolve_sector_window(
    sector_id: int | None,
    zone_windows: Mapping[int, tuple[int, int]] | None,
) -> tuple[int, int]:
    if zone_windows is None:
        # Legado: sin configuración por zona, se mantiene la paridad (VRPTW light).
        return sector_time_window_secs(sector_id)
    if sector_id is not None and sector_id in zone_windows:
        return zone_windows[sector_id]
    # Zona sin ventana configurada → sin restricción horaria dentro de la jornada.
    return (0, DAY_WINDOW_SECONDS)


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
    zone_windows: Mapping[int, tuple[int, int]] | None = None,
) -> tuple[list[float] | None, list[float] | None]:
    """Ventanas por cliente.

    Con `zone_windows` (F8) usa la ventana configurada de la zona de cada sector; un
    sector sin ventana queda sin restricción. Sin `zone_windows` cae al legado por
    paridad de sector.
    """
    if not enabled:
        return None, None
    starts: list[float] = []
    ends: list[float] = []
    for sector_id in sector_ids:
        window = _resolve_sector_window(sector_id, zone_windows)
        starts.append(float(window[0]))
        ends.append(float(window[1]))
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
    time_window_model: str | None = None,
) -> dict[str, Any]:
    model = time_window_model or "sector_morning_afternoon"
    return {
        "priorityFillLevel": priority_fill_level,
        "timeWindowEnabled": time_window_enabled,
        "kpiView": kpi_view,
        "timeWindowModel": model if time_window_enabled else None,
        "fillLevelThresholdPct": FILL_LEVEL_CRITICAL_PCT if priority_fill_level else None,
    }
