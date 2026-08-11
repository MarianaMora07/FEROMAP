"""Contrato de dotación y tiempo de servicio en paradas (ADR-003).

El ACO minimiza distancia; este módulo calcula tiempos operativos para KPIs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# --- Constantes de contrato (Fase 0) ---
DEFAULT_IDEAL_OPERATORS = 6
FIELD_OPERATORS_PER_VEHICLE = 5  # además del conductor
BASE_SERVICE_SECONDS = 300  # 5 min por punto con dotación completa
PENALTY_PER_MISSING_FIELD_OPERATOR_SEC = 30
MIN_ASSIGNED_OPERATORS = 1
MAX_OPERATORS_SHORTAGE = FIELD_OPERATORS_PER_VEHICLE


def normalize_operators_shortage(value: int | None) -> int | None:
    """Operarios de campo ausentes en el turno (simulación)."""
    if value is None:
        return None
    if 0 <= value <= MAX_OPERATORS_SHORTAGE:
        return value
    return None


def normalize_assigned_operators(
    assigned: int | None,
    *,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
) -> int:
    if assigned is None:
        return ideal
    return max(MIN_ASSIGNED_OPERATORS, min(assigned, ideal))


def resolve_effective_assigned(
    assigned: int | None,
    *,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
    operators_shortage: int | None = None,
) -> int:
    """Dotación efectiva tras ausentismo global del turno."""
    base = normalize_assigned_operators(assigned, ideal=ideal)
    shortage = normalize_operators_shortage(operators_shortage) or 0
    return max(MIN_ASSIGNED_OPERATORS, base - shortage)


def missing_field_operators(
    assigned_effective: int,
    *,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
) -> int:
    field_ideal = max(0, ideal - 1)
    field_assigned = max(0, assigned_effective - 1)
    return max(0, field_ideal - field_assigned)


def service_time_seconds_per_stop(
    assigned_effective: int,
    *,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
) -> int:
    missing = missing_field_operators(assigned_effective, ideal=ideal)
    return BASE_SERVICE_SECONDS + missing * PENALTY_PER_MISSING_FIELD_OPERATOR_SEC


def route_service_seconds(
    stop_count: int,
    assigned_effective: int,
    *,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
) -> int:
    if stop_count <= 0:
        return 0
    per_stop = service_time_seconds_per_stop(assigned_effective, ideal=ideal)
    return stop_count * per_stop


def route_total_duration_seconds(
    travel_seconds: float,
    stop_count: int,
    assigned_effective: int,
    *,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
) -> int:
    return int(round(travel_seconds)) + route_service_seconds(
        stop_count,
        assigned_effective,
        ideal=ideal,
    )


@dataclass(frozen=True)
class CrewServiceBreakdown:
    ideal_operators: int
    assigned_effective: int
    field_operators_assigned: int
    missing_field_operators: int
    service_seconds_per_stop: int
    stop_count: int
    service_seconds_total: int
    travel_seconds: int
    total_seconds: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "idealOperators": self.ideal_operators,
            "assignedEffective": self.assigned_effective,
            "fieldOperatorsAssigned": self.field_operators_assigned,
            "missingFieldOperators": self.missing_field_operators,
            "serviceSecondsPerStop": self.service_seconds_per_stop,
            "stopCount": self.stop_count,
            "serviceSecondsTotal": self.service_seconds_total,
            "travelSeconds": self.travel_seconds,
            "totalSeconds": self.total_seconds,
            "crewLabel": (
                f"{self.assigned_effective}/{self.ideal_operators} "
                f"(conductor + {self.field_operators_assigned} operarios)"
            ),
        }


def build_crew_service_breakdown(
    *,
    travel_seconds: float,
    stop_count: int,
    assigned: int | None = None,
    ideal: int = DEFAULT_IDEAL_OPERATORS,
    operators_shortage: int | None = None,
) -> CrewServiceBreakdown:
    assigned_effective = resolve_effective_assigned(
        assigned,
        ideal=ideal,
        operators_shortage=operators_shortage,
    )
    missing = missing_field_operators(assigned_effective, ideal=ideal)
    per_stop = service_time_seconds_per_stop(assigned_effective, ideal=ideal)
    service_total = route_service_seconds(stop_count, assigned_effective, ideal=ideal)
    travel_int = int(round(travel_seconds))
    return CrewServiceBreakdown(
        ideal_operators=ideal,
        assigned_effective=assigned_effective,
        field_operators_assigned=max(0, assigned_effective - 1),
        missing_field_operators=missing,
        service_seconds_per_stop=per_stop,
        stop_count=stop_count,
        service_seconds_total=service_total,
        travel_seconds=travel_int,
        total_seconds=travel_int + service_total,
    )
