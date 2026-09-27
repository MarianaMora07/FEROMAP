"""Heurística común de procesos en paralelo para los barridos del motor.

Las corridas del motor ACO son CPU-bound e independientes (cada una con su semilla), así que
se reparten en un pool de procesos. El tope evita la sobre-suscripción: medido en este equipo,
18 workers fue **más lento** que 8 (la BD y el API del contenedor compiten por CPU y el ACO es
intensivo en memoria). Fuente única para los CLI (`just wilcoxon`, `just calib-*`, Fase 0).
"""

from __future__ import annotations

import os

MAX_DEFAULT_WORKERS = 8


def default_workers() -> int:
    """Hasta :data:`MAX_DEFAULT_WORKERS` procesos (respeta la afinidad del contenedor)."""
    try:
        cores = len(os.sched_getaffinity(0))
    except AttributeError:  # plataformas sin afinidad
        cores = os.cpu_count() or 1
    return max(1, min(cores, MAX_DEFAULT_WORKERS))
