"""Sello de instancia de la calibración (Fase 13 · plan de la vista de calibración).

La evidencia de los barridos vive en `data/cache/` y **no** la toca un reset de BD
(`just db-reset` recrea volúmenes y vuelve a sembrar). Para que nadie confunda números de
otra instancia con los de la suya, cada payload guarda una **huella** de la instancia con
la que se generó y la lectura (`GET`) la compara con la huella vigente.

La huella combina:

- el **epoch de seed** (`data/cache/seed_epoch.json`, escrito al sembrar),
- escenario, número/última edición de puntos, vehículos y zonas,
- depósito, vertedero y jornada por defecto.

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
