"""Sello de instancia de la calibración (Fase 13 · plan de la vista de calibración).

La evidencia de los barridos vive en `data/cache/` y **no** la toca un reset de BD
(`just db-reset` recrea volúmenes y vuelve a sembrar). Para que nadie confunda números de
otra instancia con los de la suya, cada payload guarda una **huella** de la instancia con
la que se generó y la lectura (`GET`) la compara con la huella vigente.

La huella combina:

- el **epoch de seed** (`data/cache/seed_epoch.json`, escrito al sembrar),
- escenario, número/última edición de puntos, vehículos y zonas,
- depósito, vertedero y jornada por defecto,
- los **parámetros del motor** que cambian lo que una corrida mide: hiperparámetros del ACO,
  regla de parada, local search, pesos del objetivo y heurísticos (bloque ``engine``).

El bloque ``engine`` es lo que impide que una corrida medida con λ_b = 0 y otra medida con
λ_b = 2 se lean como comparables: sin él, dos evidencias con objetivos distintos comparten
sello y la bandera ``fresh``/``stale`` miente.

Estados de la caché frente a la instancia actual:

- ``fresh``: coincide con la instancia actual.
- ``stale``: se generó con otra instancia (por ejemplo, antes de un reset de BD).
- ``unknown``: no lleva sello (payload anterior a esta versión).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import CollectionPoint, Parish, Vehicle
from app.services.admin_service import get_algorithm_settings, get_operational_settings

logger = logging.getLogger(__name__)

CacheState = Literal["fresh", "stale", "unknown"]


def seed_epoch_path() -> Path:
    return Path(settings.data_dir) / "cache" / "seed_epoch.json"


def write_seed_epoch() -> Path:
    """Marca la BD recién sembrada (invalida la evidencia de los barridos anteriores)."""
    path = seed_epoch_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"seededAt": datetime.now(timezone.utc).isoformat()}, ensure_ascii=False),
        encoding="utf-8",
    )
    return path


def seed_epoch() -> str | None:
    path = seed_epoch_path()
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8")).get("seededAt")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Epoch de seed ilegible (%s): %s", path, exc)
        return None
    return str(value) if value else None


def _stamp(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if isinstance(value, datetime) else str(value)


def engine_fingerprint_fields(algorithm: Any) -> dict[str, Any]:
    """Parámetros del motor que cambian **lo que una corrida mide**.

    Entran los que afectan la construcción (α/β/ρ/Q), la regla de parada (paciencia), el
    local search (pasadas de 2-opt), la variante elitista, el objetivo combinado (λ_b, λ_t,
    flota mínima, jornada objetivo, peso de rebose) y los heurísticos que entran en η.

    No entran los que ya viajan en el payload de **cada** corrida (hormigas, iteraciones),
    ni los que solo afectan la planificación semanal, ni los que derivan los datos de entrada
    (ventana de calibración de tasas): incluirlos marcaría como obsoleta evidencia que sigue
    siendo válida.

    ``getattr`` con valor por defecto: la huella no debe romperse si el modelo de
    configuración todavía no expone alguna perilla.
    """

    def value(name: str) -> Any:
        raw = getattr(algorithm, name, None)
        if raw is None or isinstance(raw, bool):
            return raw
        try:
            return round(float(raw), 6)
        except (TypeError, ValueError):
            return raw

    return {
        "aco": {
            "alpha": value("aco_alpha"),
            "beta": value("aco_beta"),
            "rho": value("aco_rho"),
            "q": value("pheromone_q"),
            "elitist": value("pheromone_elitist"),
            "ants": value("aco_ants"),
            "iterations": value("aco_iterations"),
            "patience": value("aco_patience"),
            "twoOptPasses": value("two_opt_passes"),
        },
        "objective": {
            "workloadBalanceWeight": value("workload_balance_weight"),
            "makespanWeight": value("makespan_weight"),
            "minActiveVehicles": value("min_active_vehicles"),
            "maxRouteHoursTarget": value("max_route_hours_target"),
            "overflowPenaltyWeight": value("overflow_penalty_weight"),
        },
        "heuristics": {
            "atRiskMultiplier": value("heuristic_at_risk_multiplier"),
            "criticalMultiplier": value("heuristic_critical_multiplier"),
            "highMultiplier": value("heuristic_high_multiplier"),
            "matrixCriticalFactor": value("matrix_critical_factor"),
            "matrixHighFactor": value("matrix_high_factor"),
        },
    }


def instance_fingerprint_fields(db: Session, *, scenario_id: str) -> dict[str, Any]:
    """Campos que identifican la instancia que el motor resolvería ahora mismo."""
    points = db.execute(
        select(func.count(CollectionPoint.id), func.max(CollectionPoint.updated_at))
    ).one()
    vehicles = db.execute(select(func.count(Vehicle.id), func.max(Vehicle.updated_at))).one()
    zones = db.execute(select(func.count(Parish.id), func.max(Parish.updated_at))).one()
    operational = get_operational_settings(db)
    algorithm = get_algorithm_settings(db)

    return {
        "epoch": seed_epoch(),
        "scenario": scenario_id,
        "points": {"count": int(points[0] or 0), "latest": _stamp(points[1])},
        "vehicles": {"count": int(vehicles[0] or 0), "latest": _stamp(vehicles[1])},
        "zones": {"count": int(zones[0] or 0), "latest": _stamp(zones[1])},
        "depot": [round(float(operational.depot_lat), 5), round(float(operational.depot_lon), 5)],
        "landfill": [
            round(float(operational.landfill_lat), 5),
            round(float(operational.landfill_lon), 5),
        ],
        "shiftHours": algorithm.default_shift_hours,
        "engine": engine_fingerprint_fields(algorithm),
    }


def fingerprint_digest(fields: dict[str, Any]) -> str:
    """Digest estable de la huella (independiente del orden de las claves)."""
    canonical = json.dumps(fields, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:16]


def current_fingerprint(db: Session, *, scenario_id: str) -> str:
    return fingerprint_digest(instance_fingerprint_fields(db, scenario_id=scenario_id))


def cache_state(payload: dict[str, Any] | None, current: str) -> CacheState:
    """Estado de un payload frente a la huella vigente."""
    if not payload:
        return "unknown"
    stored = payload.get("instanceFingerprint")
    if not stored:
        return "unknown"
    return "fresh" if stored == current else "stale"


def with_freshness(payload: dict[str, Any], db: Session, *, scenario_id: str) -> dict[str, Any]:
    """Copia del payload con su estado frente a la instancia actual (no reescribe la caché)."""
    current = current_fingerprint(db, scenario_id=scenario_id)
    state = cache_state(payload, current)
    enriched = dict(payload)
    enriched["instanceFingerprint"] = payload.get("instanceFingerprint")
    enriched["currentFingerprint"] = current
    enriched["cacheState"] = state
    enriched["stale"] = state == "stale"
    return enriched
