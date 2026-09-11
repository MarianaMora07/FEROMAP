"""Distribución de frecuencias lun–vie coherente con la física (B1, Fase 5).

La frecuencia **declarada** se deriva de la frecuencia **requerida** por la tasa de
llenado (ver ``app.domain.criticality``), dejando un subconjunto determinista de
puntos bajo-servidos a propósito para ejercitar ``overloaded``.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from app.domain.criticality import MAX_VISITS_PER_WEEK, WEEK_HOURS, required_visits_per_week

UNARE_I_CODES = frozenset({"CNT-001", "CNT-002", "CNT-003"})
DEFAULT_EFFECTIVE_FROM = date(2026, 1, 1)
TARGET_VISIT_SCHEDULE_COUNT = 120

# 1 de cada N puntos queda bajo-servido a propósito (prueba de `overloaded`).
UNDER_SERVED_EVERY = 9

# Factor de llenado por zona poblada (determinista por nombre de sector).
_POPULATED_SECTOR_FACTORS: dict[str, float] = {
    "Unare I": 1.40,
    "Unare II": 1.25,
    "El caimito 1-2-3-4": 1.20,
    "Villa Ikabaru": 1.15,
    "Curagua B": 1.10,
}
DEFAULT_SECTOR_FILL_RATE_FACTOR = 1.0

# Override puntual: contenedores de Unare I se llenan aún más rápido.
UNARE_I_OVERRIDE_FACTOR = 1.5

# Ofertas de días lun–vie; cada visita usa un día distinto.
_WEEKDAY_COUNT = 5


def point_code_index(code: str) -> int:
    suffix = code.removeprefix("CNT-")
    if not suffix.isdigit():
        raise ValueError(f"Código de punto inválido: {code}")
    return int(suffix)


def baseline_fill_hours(code: str) -> int:
    """Horas base de llenado (72–119 h), igual que el generador de puntos."""
    return 72 + ((point_code_index(code) * 7) % 48)


def sector_fill_rate_factor(name: str) -> float:
    return _POPULATED_SECTOR_FACTORS.get(name, DEFAULT_SECTOR_FILL_RATE_FACTOR)


def point_fill_rate_override(code: str) -> float | None:
    return UNARE_I_OVERRIDE_FACTOR if code in UNARE_I_CODES else None


def required_visits_for_code(code: str) -> int:
    hours = baseline_fill_hours(code)
    return max(1, min(MAX_VISITS_PER_WEEK, math.ceil(WEEK_HOURS / hours)))


def declared_visits_for_code(code: str) -> int:
    """Frecuencia declarada (baseline, sin factor de zona/override)."""
    required = required_visits_for_code(code)
    if required > 1 and point_code_index(code) % UNDER_SERVED_EVERY == 0:
        return required - 1
    return required


def weekdays_for_visits(code: str, visits: int) -> list[int]:
    """Elige ``visits`` días distintos de lun–vie de forma determinista."""
    count = max(1, min(_WEEKDAY_COUNT, visits))
    start = (point_code_index(code) - 1) % _WEEKDAY_COUNT
    return sorted({(start + step * 2) % _WEEKDAY_COUNT for step in range(count)})


def weekdays_for_point(code: str) -> tuple[list[int], int]:
    visits = declared_visits_for_code(code)
    return weekdays_for_visits(code, visits), visits


def planned_visits_and_weekdays(point: Any) -> tuple[int, list[int]]:
    """Frecuencia declarada a partir de la física real del punto.

    Aplica el factor de zona/override vía ``required_visits_per_week`` y deja
    bajo-servido el subconjunto ``UNDER_SERVED_EVERY``.
    """
    required = required_visits_per_week(point)
    code = str(getattr(point, "code", ""))
    declared = required
    if required > 1 and point_code_index(code) % UNDER_SERVED_EVERY == 0:
        declared = required - 1
    return declared, weekdays_for_visits(code, declared)


def build_visit_schedule_row(
    code: str,
    *,
    effective_from: date = DEFAULT_EFFECTIVE_FROM,
) -> dict[str, object]:
    weekdays, visits = weekdays_for_point(code)
    return {
        "pointCode": code,
        "visitsPerWeek": visits,
        "weekdays": weekdays,
        "effectiveFrom": effective_from.isoformat(),
    }


def default_visit_schedule_rows(
    *,
    count: int = TARGET_VISIT_SCHEDULE_COUNT,
    effective_from: date = DEFAULT_EFFECTIVE_FROM,
) -> list[dict[str, object]]:
    return [
        build_visit_schedule_row(f"CNT-{index:03d}", effective_from=effective_from)
        for index in range(1, count + 1)
    ]
