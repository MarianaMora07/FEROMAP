"""Modelo de generación temporal de residuos (Tarea 3).

Cada contenedor tiene una tasa de llenado lineal ``capacidad / horas_para_llenarse``.
Regla de estado:
- Si el contenedor fue vaciado alguna vez (``last_emptied_at`` definido), su llenado
  proyectado **crece desde 0** a partir de ese instante.
- Si nunca se vació (datos sembrados), se conserva el valor sembrado en
  ``current_fill_level_kg`` (evita "llenados mágicos" en la demo).

Todas las funciones son tolerantes a objetos parciales (duck-typing) para poder
usarse con modelos ORM o con namespace de prueba.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

# Reexport de la fuente única de verdad (``app.domain.criticality``).
from app.domain.criticality import CRITICAL_FILL_PCT

# Horas por defecto que tarda un contenedor en llenarse por completo (fallback).
DEFAULT_FILL_HOURS = 72.0

# Horas de un día (conversión entre kg/día y kg/h).
KG_PER_DAY = 24.0


def _as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _as_utc(moment: datetime | None) -> datetime | None:
    if moment is None:
        return None
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def estimated_fill_hours(point: Any) -> float:
    """Horas estimadas para llenar el contenedor (columna ``estimated_fill_hours``)."""
    value = getattr(point, "estimated_fill_hours", None)
    hours = _as_float(value)
    if hours <= 0:
        return DEFAULT_FILL_HOURS
    return hours


def capacity_kg(point: Any) -> float:
    return _as_float(getattr(point, "max_capacity_kg", None))


def effective_fill_rate_factor(point: Any) -> float:
    """Factor de velocidad de llenado: override del punto > factor del sector > 1.0.

    ``> 1`` = se llena más rápido (p. ej. zona poblada). Duck-typed: tolera objetos
    parciales sin ``fill_rate_factor_override`` ni ``sector``.
    """
    override = _as_float(getattr(point, "fill_rate_factor_override", None))
    if override > 0:
        return override
    sector = getattr(point, "sector", None)
    sector_factor = _as_float(getattr(sector, "fill_rate_factor", None))
    if sector_factor > 0:
        return sector_factor
    return 1.0


def effective_fill_hours(point: Any) -> float:
    """Horas hasta llenarse según la tasa efectiva.

    Si el contenedor tiene una tasa absoluta (kg/día), se deriva de ella; en caso
    contrario se mantiene el baseline ``estimated_fill_hours / factor``.
    """
    cap = capacity_kg(point)
    rate = generation_rate_kg_per_hour(point)
    if cap > 0 and rate > 0:
        return cap / rate
    return _derived_fill_hours(point)


def _derived_fill_hours(point: Any) -> float:
    """Horas de llenado derivadas del baseline y el factor de zona/punto."""
    return estimated_fill_hours(point) / effective_fill_rate_factor(point)


def explicit_generation_rate_kg_per_day(point: Any) -> float:
    """Tasa absoluta del contenedor (kg/día), 0.0 si no está configurada."""
    return max(0.0, _as_float(getattr(point, "generation_rate_kg_per_day", None)))


def generation_rate_kg_per_hour(point: Any) -> float:
    """Tasa de generación efectiva (kg/h).

    Prioridad: tasa absoluta del contenedor (``generation_rate_kg_per_day``) >
    ``capacidad / horas derivadas`` (baseline ajustado por el factor de zona/punto).
    """
    day_rate = explicit_generation_rate_kg_per_day(point)
    if day_rate > 0:
        return day_rate / KG_PER_DAY
    cap = capacity_kg(point)
    hours = _derived_fill_hours(point)
    if cap <= 0 or hours <= 0:
        return 0.0
    return cap / hours


def generation_rate_kg_per_day(point: Any) -> float:
    """Tasa de generación efectiva (kg/día)."""
    return generation_rate_kg_per_hour(point) * KG_PER_DAY


def _clamp_kg(value: float, cap: float) -> Decimal:
    if cap <= 0:
        return Decimal("0")
    return Decimal(str(round(min(max(value, 0.0), cap), 2)))


def stored_fill_level_kg(point: Any) -> Decimal:
    """Llenado sembrado/almacenado (sin proyección)."""
    cap = capacity_kg(point)
    fill = _as_float(getattr(point, "current_fill_level_kg", None))
    return _clamp_kg(fill, cap)


def projected_fill_level_kg(point: Any, *, at: datetime | None = None) -> Decimal:
    """Kg de llenado proyectados en el instante ``at`` (ahora por defecto)."""
    cap = capacity_kg(point)
    if cap <= 0:
        return Decimal("0")

    last_emptied = _as_utc(getattr(point, "last_emptied_at", None))
    if last_emptied is None:
        return stored_fill_level_kg(point)

    at = _as_utc(at) or datetime.now(timezone.utc)
    elapsed_hours = max(0.0, (at - last_emptied).total_seconds() / 3600.0)
    return _clamp_kg(generation_rate_kg_per_hour(point) * elapsed_hours, cap)


def projected_fill_level_pct(point: Any, *, at: datetime | None = None) -> int:
    cap = capacity_kg(point)
    if cap <= 0:
        return 0
    fill = float(projected_fill_level_kg(point, at=at))
    return int(round(fill / cap * 100))


def projected_fill_level_unclamped_kg(point: Any, *, at: datetime | None = None) -> float:
    """Llenado proyectado **sin recortar a la capacidad** (para medir rebose).

    Para contenedores nunca vaciados devuelve el llenado almacenado (no crece solo).
    """
    last_emptied = _as_utc(getattr(point, "last_emptied_at", None))
    if last_emptied is None:
        return float(stored_fill_level_kg(point))
    at = _as_utc(at) or datetime.now(timezone.utc)
    elapsed_hours = max(0.0, (at - last_emptied).total_seconds() / 3600.0)
    return generation_rate_kg_per_hour(point) * elapsed_hours


def overflow_kg(point: Any, *, at: datetime | None = None) -> Decimal:
    """Kg que exceden la capacidad en el instante ``at`` (0 si no rebosa)."""
    cap = capacity_kg(point)
    if cap <= 0:
        return Decimal("0")
    over = projected_fill_level_unclamped_kg(point, at=at) - cap
    if over <= 0:
        return Decimal("0")
    return Decimal(str(round(over, 2)))


def overflow_ratio(point: Any, *, at: datetime | None = None) -> float:
    """Rebose como fracción de la capacidad (>= 0)."""
    cap = capacity_kg(point)
    if cap <= 0:
        return 0.0
    return round(float(overflow_kg(point, at=at)) / cap, 4)


def hours_until_overflow(point: Any, *, at: datetime | None = None) -> float | None:
    """Horas desde ``at`` hasta superar la capacidad (None si no aplica).

    Complementa ``hours_until_critical``: el rebose ocurre al 100 % de la capacidad.
    """
    cap = capacity_kg(point)
    rate = generation_rate_kg_per_hour(point)
    if cap <= 0 or rate <= 0:
        return None
    at = _as_utc(at) or datetime.now(timezone.utc)
    last_emptied = _as_utc(getattr(point, "last_emptied_at", None))
    if last_emptied is not None:
        elapsed = max(0.0, (at - last_emptied).total_seconds() / 3600.0)
        base_kg = rate * elapsed
    else:
        base_kg = float(stored_fill_level_kg(point))
    if base_kg >= cap:
        return 0.0
    return (cap - base_kg) / rate


def hours_until_critical(
    point: Any,
    *,
    at: datetime | None = None,
    threshold_pct: float = CRITICAL_FILL_PCT,
) -> float | None:
    """Horas desde ``at`` hasta cruzar el umbral crítico (None si no aplica).

    Para contenedores nunca vaciados se toma como base el llenado sembrado; para
    los vaciados, el crecimiento desde el último vaciado.
    """
    cap = capacity_kg(point)
    if cap <= 0:
        return None
    rate = generation_rate_kg_per_hour(point)
    if rate <= 0:
        return None

    threshold_kg = cap * threshold_pct / 100.0
    at = _as_utc(at) or datetime.now(timezone.utc)
    last_emptied = _as_utc(getattr(point, "last_emptied_at", None))
    if last_emptied is not None:
        # El llenado crece desde 0 en el último vaciado (ignora el sembrado).
        elapsed = max(0.0, (at - last_emptied).total_seconds() / 3600.0)
        base_kg = rate * elapsed
    else:
        base_kg = float(stored_fill_level_kg(point))
    if base_kg >= threshold_kg:
        return 0.0
    return (threshold_kg - base_kg) / rate


def critical_day_offset(point: Any, *, days: int, at: datetime | None = None) -> int | None:
    """Índice de día (0..days-1) en que el contenedor cruza el umbral crítico."""
    if days < 1:
        return None
    hours = hours_until_critical(point, at=at)
    if hours is None:
        return None
    day = int(hours // 24)
    return day if day < days else None


def fill_events_cycle_daily_values(
    point: Any,
    events: Iterable[tuple[datetime, float]],
    *,
    days: int,
    now: datetime | None = None,
) -> list[float]:
    """Serie diaria (%) reconstruida a partir de eventos de recolección.

    ``events``: pares (momento, kg de llenado justo antes de recolectar).
    El valor de cada día es el máximo entre el llenado al final del día
    (crecimiento lineal desde el último vaciado) y el pico medido ese día
    (si hubo recolección). Devuelve lista vacía si no hay suficientes datos.
    """
    now = _as_utc(now) or datetime.now(timezone.utc)
    cap = capacity_kg(point)
    if cap <= 0 or days < 1:
        return []
    rate = generation_rate_kg_per_hour(point)
    today = now.date()

    cleaned: list[tuple[datetime, float]] = []
    for moment, weight in events:
        m = _as_utc(moment)
        if m is not None and weight is not None and weight > 0:
            cleaned.append((m, float(weight)))
    if not cleaned:
        return []
    cleaned.sort(key=lambda item: item[0])

    spike_by_day: dict[Any, float] = {}
    for moment, weight in cleaned:
        day = moment.date()
        spike_by_day[day] = max(spike_by_day.get(day, 0.0), weight)

    if len(spike_by_day) < 2:
        return []

    resets = [moment for moment, _weight in cleaned]
    first_moment = cleaned[0][0]
    first_weight = cleaned[0][1]
    values: list[float] = []

    for offset in range(days):
        day = today - timedelta(days=days - 1 - offset)
        day_end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
        previous = [moment for moment in resets if moment < day_end]
        if previous:
            last_reset = max(previous)
            kg_end = rate * max(0.0, (day_end - last_reset).total_seconds() / 3600.0)
        else:
            # Sin vaciados previos: se extrapola hacia atrás desde el primer evento.
            kg_end = max(0.0, first_weight - rate * max(0.0, (first_moment - day_end).total_seconds() / 3600.0))
        kg_end = min(kg_end, cap)
        spike = spike_by_day.get(day, 0.0)
        kg_value = max(kg_end, spike)
        values.append(min(100.0, kg_value / cap * 100.0))

    return values
