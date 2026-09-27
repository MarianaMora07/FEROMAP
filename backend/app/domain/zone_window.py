"""Ventanas horarias por zona: parseo y normalización (F8).

Las ventanas del motor ACO se expresan en **segundos desde el inicio de jornada**
(0 = 06:00). La configuración por zona se guarda como "HH:MM" y se recorta a la
jornada operativa para no introducir ventanas imposibles.
"""

from __future__ import annotations

SHIFT_START_SECONDS = 6 * 3600  # 06:00
SHIFT_END_SECONDS = 18 * 3600  # 18:00
DAY_WINDOW_SECONDS = SHIFT_END_SECONDS - SHIFT_START_SECONDS  # 12 h


def parse_hhmm(value: str | None) -> int | None:
    """Convierte "HH:MM" a segundos desde 00:00. ``None`` si es inválido."""
    if not value:
        return None
    parts = value.strip().split(":")
    if len(parts) != 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
    except ValueError:
        return None
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        return None
    return hours * 3600 + minutes * 60


def window_offsets(start: str | None, end: str | None) -> tuple[int, int] | None:
    """Ventana en segundos desde el inicio de jornada, válida dentro de 06:00–18:00.

    Devuelve ``None`` si falta un extremo, el formato es inválido, el inicio no es
    anterior al fin, o la ventana cae fuera de la jornada operativa.
    """
    start_seconds = parse_hhmm(start)
    end_seconds = parse_hhmm(end)
    if start_seconds is None or end_seconds is None:
        return None
    if start_seconds < SHIFT_START_SECONDS or end_seconds > SHIFT_END_SECONDS:
        return None
    if end_seconds <= start_seconds:
        return None
    return (start_seconds - SHIFT_START_SECONDS, end_seconds - SHIFT_START_SECONDS)
