"""Calibración de la tasa de generación con pesos reales recolectados.

Cada vez que el conductor avanza una parada, ``operations_service.advance_route``
guarda el peso recolectado (``route_waypoints.collected_weight_kg``) y marca el
contenedor como vaciado. Entre dos recolecciones consecutivas, el peso de la
segunda es el material acumulado desde la primera, de modo que

    tasa_i [kg/h] = peso_i / (t_i - t_{i-1})

es una muestra del ritmo real. La tasa calibrada es el promedio exponencial
(EWMA) de las muestras, dando más peso a la observación reciente.

Módulo puro (sin BD): recibe eventos ya ordenados.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

DEFAULT_CALIBRATION_ALPHA = 0.4


def rate_samples_kg_per_hour(
    events: Iterable[tuple[datetime, float]],
) -> list[float]:
    """Muestras de tasa a partir de recolecciones consecutivas.

    ``events``: pares ``(momento, peso_recolectado_kg)`` ordenados de forma
    ascendente por momento. Descarta intervalos no positivos y pesos <= 0.
    """
    ordered = list(events)
    samples: list[float] = []
    for (previous_at, _previous_weight), (moment, weight) in zip(ordered, ordered[1:]):
        hours = (moment - previous_at).total_seconds() / 3600.0
        if hours <= 0 or weight is None or weight <= 0:
            continue
        samples.append(float(weight) / hours)
    return samples


def ewma(values: Iterable[float], *, alpha: float = DEFAULT_CALIBRATION_ALPHA) -> float | None:
    """Media móvil exponencial; ``alpha`` en (0, 1]. ``None`` si no hay valores."""
    clamped = max(0.0001, min(1.0, float(alpha)))
    result: float | None = None
    for value in values:
        result = float(value) if result is None else clamped * float(value) + (1 - clamped) * result
    return result


def estimate_rate_kg_per_hour(
    events: Iterable[tuple[datetime, float]],
    *,
    alpha: float = DEFAULT_CALIBRATION_ALPHA,
) -> tuple[float | None, int]:
    """Tasa calibrada (kg/h) y nº de muestras usadas.

    Devuelve ``(None, 0)`` cuando no hay al menos dos recolecciones consecutivas.
    """
    samples = rate_samples_kg_per_hour(events)
    if not samples:
        return None, 0
    return ewma(samples, alpha=alpha), len(samples)
