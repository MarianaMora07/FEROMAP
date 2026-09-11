"""Fuente única de verdad de criticidad de contenedores (Fase 1).

Ver ``docs/fase-0/adr-criticidad.md`` (ADR-002). Este módulo define los umbrales
de llenado y las funciones puras que comparten los consumidores del backend.

No accede a la base de datos: el umbral configurable se resuelve en la capa de
servicio (``admin_service.resolve_critical_threshold``) y se inyecta aquí.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from enum import Enum
from typing import Any

# Umbrales de llenado (%).
CRITICAL_FILL_PCT = 80.0
HIGH_FILL_PCT = 60.0
NORMAL_FILL_PCT = 30.0

# Horas de una semana (para derivar la frecuencia requerida).
WEEK_HOURS = 168.0
MAX_VISITS_PER_WEEK = 7

# Hora de inicio de recolección (espeja DEFAULT_COLLECTION_START del residente).
DEFAULT_VISIT_HOUR = 7


class CriticalityLevel(str, Enum):
    CRITICAL = "critico"
    FULL = "lleno"
    NORMAL = "normal"
    PARTIAL = "parcial"
    OUT_OF_SERVICE = "fueraDeServicio"


@dataclass(frozen=True)
class Criticality:
    """Resultado de evaluar un contenedor contra los umbrales de criticidad."""

    level: CriticalityLevel
    fill_pct: int
    is_critical: bool
    hours_until_critical: float | None = None

    @property
    def status(self) -> str:
        return self.level.value


def normalize_critical_threshold(value: float | str | None) -> float:
    """Devuelve un umbral válido (0–100); cae a ``CRITICAL_FILL_PCT`` si no lo es."""
    try:
        candidate = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return CRITICAL_FILL_PCT
    if not 0.0 <= candidate <= 100.0:
        return CRITICAL_FILL_PCT
    return candidate


def fill_status_from_level(
    level: int,
    *,
    point_status: str = "active",
    critical_pct: float = CRITICAL_FILL_PCT,
    high_pct: float = HIGH_FILL_PCT,
) -> str:
    """Etiqueta de estado a partir del % de llenado.

    Antes vivía duplicada con cortes ``90 / 70`` en el servicio y en el frontend.
    El nivel crítico se alinea a ``critical_pct`` (80 %).
    """
    if point_status != "active":
        return CriticalityLevel.OUT_OF_SERVICE.value
    if level >= critical_pct:
        return CriticalityLevel.CRITICAL.value
    if level >= high_pct:
        return CriticalityLevel.FULL.value
    if level >= NORMAL_FILL_PCT:
        return CriticalityLevel.NORMAL.value
    return CriticalityLevel.PARTIAL.value


def is_critical_now(fill_pct: float, *, critical_pct: float = CRITICAL_FILL_PCT) -> bool:
    """¿El llenado alcanza el umbral crítico? (estado, no riesgo de calendario)."""
    return fill_pct >= critical_pct


def is_full_now(fill_pct: float, *, high_pct: float = HIGH_FILL_PCT) -> bool:
    """¿El llenado alcanza el umbral de \"lleno\"?"""
    return fill_pct >= high_pct


def required_visits_per_week(point: Any) -> int:
    """Visitas/semana que exige la física para que el contenedor no rebose (1..7).

    Se deriva de las horas efectivas de llenado (baseline ajustado por el factor de
    zona/contenedor). Una agenda *declarada* que sirva menos es ``overloaded``.
    """
    from app.domain.waste_generation import effective_fill_hours

    hours = effective_fill_hours(point)
    if hours <= 0:
        return MAX_VISITS_PER_WEEK
    return max(1, min(MAX_VISITS_PER_WEEK, math.ceil(WEEK_HOURS / hours)))


def is_overloaded(required_visits: int, declared_visits: int | None) -> bool:
    """¿La agenda declarada sirve menos de lo que la física exige?

    ``declared_visits is None`` (sin agenda) no es sobrecarga: la decisión es del
    planificador, no de la física.
    """
    if declared_visits is None:
        return False
    return required_visits > declared_visits


def _ensure_utc(moment: datetime | None) -> datetime:
    if moment is None:
        return datetime.now(timezone.utc)
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def hours_until_next_visit(
    *,
    weekdays: Iterable[int],
    at: datetime | None = None,
    visit_hour: int = DEFAULT_VISIT_HOUR,
) -> float | None:
    """Horas desde ``at`` hasta la próxima recolección programada (None si no hay).

    ``weekdays`` usa 0=lunes..6=domingo (``datetime.weekday()``). Espeja la
    semántica de ``resident_schedule_service`` (ventana desde ``visit_hour``).
    """
    days = {int(day) for day in weekdays if 0 <= int(day) <= 6}
    if not days:
        return None
    now = _ensure_utc(at)
    today = now.date()
    for offset in range(8):
        candidate = today + timedelta(days=offset)
        if candidate.weekday() not in days:
            continue
        visit_moment = datetime.combine(candidate, time(hour=visit_hour), tzinfo=timezone.utc)
        if visit_moment > now:
            return (visit_moment - now).total_seconds() / 3600.0
    return None


def is_at_risk_before_next_visit(
    point: Any,
    *,
    weekdays: Iterable[int] | None = None,
    next_visit_hours: float | None = None,
    at: datetime | None = None,
    threshold: float | None = None,
    visit_hour: int = DEFAULT_VISIT_HOUR,
) -> bool:
    """¿Se llenará hasta el umbral antes de la próxima recolección programada?

    Combina urgencia (``hours_until_critical``) con la agenda. Sin agenda
    (``weekdays`` vacío / ``None``) devuelve ``False``.
    """
    from app.domain.waste_generation import hours_until_critical

    if next_visit_hours is None:
        next_visit_hours = hours_until_next_visit(
            weekdays=weekdays or (), at=at, visit_hour=visit_hour
        )
    if next_visit_hours is None:
        return False
    huc = hours_until_critical(point, at=at, threshold_pct=normalize_critical_threshold(threshold))
    if huc is None:
        return False
    return huc <= next_visit_hours


def evaluate_criticality(
    point: Any,
    *,
    at: datetime | None = None,
    threshold: float | None = None,
) -> Criticality:
    """Evalúa un contenedor (duck-typed) contra los umbrales de criticidad."""
    from app.domain.waste_generation import (
        hours_until_critical,
        projected_fill_level_pct,
    )

    critical_pct = normalize_critical_threshold(threshold)
    fill_pct = projected_fill_level_pct(point, at=at)
    level = CriticalityLevel(
        fill_status_from_level(
            fill_pct,
            point_status=getattr(point, "status", "active") or "active",
            critical_pct=critical_pct,
        )
    )
    return Criticality(
        level=level,
        fill_pct=fill_pct,
        is_critical=level is CriticalityLevel.CRITICAL,
        hours_until_critical=hours_until_critical(point, at=at, threshold_pct=critical_pct),
    )
