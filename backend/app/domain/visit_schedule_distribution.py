"""Distribución de frecuencias lun–vie para la muestra metodológica (B1)."""

from __future__ import annotations

from datetime import date

UNARE_I_CODES = frozenset({"CNT-001", "CNT-002", "CNT-003"})
DEFAULT_EFFECTIVE_FROM = date(2026, 1, 1)
TARGET_VISIT_SCHEDULE_COUNT = 120


def point_code_index(code: str) -> int:
    suffix = code.removeprefix("CNT-")
    if not suffix.isdigit():
        raise ValueError(f"Código de punto inválido: {code}")
    return int(suffix)


def weekdays_for_point(code: str) -> tuple[list[int], int]:
    index = point_code_index(code)
    if code in UNARE_I_CODES:
        weekdays = [0, 2, 4]
        return weekdays, len(weekdays)

    primary = (index - 1) % 5
    mod = index % 10
    if mod in (0, 1, 2, 3):
        weekdays = [primary]
    elif mod in (4, 5, 6):
        secondary = (primary + 2) % 5
        weekdays = sorted({primary, secondary})
    else:
        weekdays = sorted({primary, (primary + 1) % 5, (primary + 3) % 5})
    return weekdays, len(weekdays)


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
