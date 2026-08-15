"""Contrato de vertedero y jornada operativa (ADR-004).

El ACO minimiza distancia; este módulo calcula tiempos operativos,
presupuesto de jornada y reglas de corte para KPIs y motor (Fase 2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# --- Constantes de contrato (Fase 0) ---
DEFAULT_DEPOT_LAT = -62.715
DEFAULT_DEPOT_LON = 8.295
DEFAULT_LANDFILL_LAT = -62.690
DEFAULT_LANDFILL_LON = 8.280
DEFAULT_LANDFILL_UNLOAD_MINUTES = 15
DEFAULT_LANDFILL_UNLOAD_SECONDS = DEFAULT_LANDFILL_UNLOAD_MINUTES * 60
DEFAULT_WORK_START = "06:00"
DEFAULT_WORK_END = "18:00"
DEFAULT_SHIFT_BUDGET_SECONDS = 12 * 3600  # 06:00 → 18:00

TIME_HHMM_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def landfill_node_index(n_customers: int) -> int:
    """Índice del vertedero en la matriz: N + 1 (0 = depósito, 1..N = clientes)."""
    return n_customers + 1


def normalize_landfill_unload_minutes(value: int | None) -> int:
    if value is None:
        return DEFAULT_LANDFILL_UNLOAD_MINUTES
    return max(1, min(value, 120))


def landfill_unload_seconds(unload_minutes: int | None = None) -> int:
    minutes = normalize_landfill_unload_minutes(unload_minutes)
    return minutes * 60


def parse_time_hhmm(value: str) -> tuple[int, int]:
    """Parsea 'HH:MM' a (horas, minutos). Lanza ValueError si el formato es inválido."""
    match = TIME_HHMM_RE.match(value.strip())
    if match is None:
        raise ValueError(f"Hora inválida (esperado HH:MM): {value!r}")
    hours = int(match.group(1))
    minutes = int(match.group(2))
    if hours > 23 or minutes > 59:
        raise ValueError(f"Hora fuera de rango: {value!r}")
    return hours, minutes


def seconds_since_midnight(value: str) -> int:
    hours, minutes = parse_time_hhmm(value)
    return hours * 3600 + minutes * 60


def shift_budget_seconds(
    work_start: str = DEFAULT_WORK_START,
    work_end: str = DEFAULT_WORK_END,
) -> int:
    """Segundos entre inicio y fin de jornada (mismo día). Default: 06:00→18:00 = 43 200 s."""
    start = seconds_since_midnight(work_start)
    end = seconds_since_midnight(work_end)
    if end <= start:
        raise ValueError(f"work_end debe ser posterior a work_start: {work_start} – {work_end}")
    return end - start


def route_landfill_unload_seconds(
    landfill_visit_count: int,
    unload_minutes: int | None = None,
) -> int:
    if landfill_visit_count <= 0:
        return 0
    return landfill_visit_count * landfill_unload_seconds(unload_minutes)


def route_operational_elapsed_seconds(
    travel_seconds: float,
    collection_stop_count: int,
    service_seconds_per_stop: int,
    landfill_visit_count: int,
    *,
    unload_minutes: int | None = None,
) -> int:
    """Tiempo operativo acumulado: viaje + paradas + descargas en vertedero."""
    travel = int(round(travel_seconds))
    service_total = max(0, collection_stop_count) * service_seconds_per_stop
    unload_total = route_landfill_unload_seconds(landfill_visit_count, unload_minutes)
    return travel + service_total + unload_total


def can_fit_stop_in_shift(
    elapsed_sec: float,
    travel_to_sec: float,
    service_at_sec: float,
    shift_budget_sec: int,
) -> bool:
    """True si agregar la parada candidata no supera el presupuesto de jornada."""
    return elapsed_sec + travel_to_sec + service_at_sec <= shift_budget_sec


def shift_utilization_pct(elapsed_sec: float, shift_budget_sec: int) -> float:
    if shift_budget_sec <= 0:
        return 0.0
    return min(100.0, elapsed_sec / shift_budget_sec * 100.0)


@dataclass(frozen=True)
class OperationalFacilities:
    depot_lat: float = DEFAULT_DEPOT_LAT
    depot_lon: float = DEFAULT_DEPOT_LON
    landfill_lat: float = DEFAULT_LANDFILL_LAT
    landfill_lon: float = DEFAULT_LANDFILL_LON
    landfill_unload_minutes: int = DEFAULT_LANDFILL_UNLOAD_MINUTES
    work_start: str = DEFAULT_WORK_START
    work_end: str = DEFAULT_WORK_END

    @property
    def landfill_unload_seconds(self) -> int:
        return landfill_unload_seconds(self.landfill_unload_minutes)

    @property
    def shift_budget_seconds(self) -> int:
        return shift_budget_seconds(self.work_start, self.work_end)


@dataclass(frozen=True)
class LandfillRouteBreakdown:
    travel_seconds: int
    collection_stop_count: int
    service_seconds_per_stop: int
    service_seconds_total: int
    landfill_visit_count: int
    unload_seconds_per_visit: int
    unload_seconds_total: int
    elapsed_seconds: int
    shift_budget_seconds: int
    shift_utilization_pct: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "travelSeconds": self.travel_seconds,
            "collectionStopCount": self.collection_stop_count,
            "serviceSecondsPerStop": self.service_seconds_per_stop,
            "serviceSecondsTotal": self.service_seconds_total,
            "landfillVisitCount": self.landfill_visit_count,
            "unloadSecondsPerVisit": self.unload_seconds_per_visit,
            "unloadSecondsTotal": self.unload_seconds_total,
            "elapsedSeconds": self.elapsed_seconds,
            "shiftBudgetSeconds": self.shift_budget_seconds,
            "shiftUtilizationPct": round(self.shift_utilization_pct, 1),
            "unloadHours": round(self.unload_seconds_total / 3600, 2),
            "shiftBudgetHours": round(self.shift_budget_seconds / 3600, 1),
            "shiftUsedHours": round(self.elapsed_seconds / 3600, 2),
        }


def build_landfill_route_breakdown(
    *,
    travel_seconds: float,
    collection_stop_count: int,
    service_seconds_per_stop: int,
    landfill_visit_count: int,
    unload_minutes: int | None = None,
    work_start: str = DEFAULT_WORK_START,
    work_end: str = DEFAULT_WORK_END,
) -> LandfillRouteBreakdown:
    travel = int(round(travel_seconds))
    service_total = max(0, collection_stop_count) * service_seconds_per_stop
    unload_per_visit = landfill_unload_seconds(unload_minutes)
    unload_total = landfill_visit_count * unload_per_visit
    elapsed = travel + service_total + unload_total
    budget = shift_budget_seconds(work_start, work_end)
    return LandfillRouteBreakdown(
        travel_seconds=travel,
        collection_stop_count=collection_stop_count,
        service_seconds_per_stop=service_seconds_per_stop,
        service_seconds_total=service_total,
        landfill_visit_count=landfill_visit_count,
        unload_seconds_per_visit=unload_per_visit,
        unload_seconds_total=unload_total,
        elapsed_seconds=elapsed,
        shift_budget_seconds=budget,
        shift_utilization_pct=shift_utilization_pct(elapsed, budget),
    )
