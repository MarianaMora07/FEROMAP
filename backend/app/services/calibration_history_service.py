"""Historial de corridas de calibración (Fase 13 · vista de calibración).

Cada barrido completado deja una fila en `optimization_jobs` con
``job_type='calibration'`` y su payload en ``result_json``:

- las corridas lanzadas desde la UI/API ya escriben esa fila como job;
- las corridas lanzadas por CLI (`just phase3-sensitivity`, `just phase13-sweep`)
  la escriben aquí con :func:`record_calibration_run`.

Es **información histórica**: la vista muestra la última corrida por defecto y permite
abrir una anterior. Nada de esto borra ni sobrescribe la caché vigente.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import OptimizationJobRecord
from app.services.instance_fingerprint import cache_state, current_fingerprint

logger = logging.getLogger(__name__)

HISTORY_PHASE = "histórico"


def record_calibration_run(
    db: Session,
    *,
    sweep: str,
    payload: dict[str, Any],
    duration_seconds: float | None = None,
) -> str:
    """Guarda una corrida de barrido en el historial (una sola fila por corrida)."""
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    params = {
        "sweep": sweep,
        "scenario_id": payload.get("scenarioId"),
        "seed": payload.get("seed"),
        "instanceFingerprint": payload.get("instanceFingerprint"),
        "durationSeconds": payload.get("durationSeconds", duration_seconds),
    }
    db.add(
        OptimizationJobRecord(
            id=run_id,
            job_type="calibration",
            status="completed",
            phase=HISTORY_PHASE,
            progress=100,
            params_json=json.dumps(params, ensure_ascii=False, default=str),
            result_json=json.dumps(payload, ensure_ascii=False, default=str),
            created_at=now,
            started_at=now,
            finished_at=now,
        )
    )
    db.commit()
    return run_id


def _params(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        loaded = json.loads(raw)
    except Exception:  # noqa: BLE001
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _state_for(db: Session, stamp: Any, scenario_id: Any, cache: dict[str, str]) -> str:
    """Estado del sello de una corrida frente a la instancia vigente de su escenario."""
    if not isinstance(stamp, str) or not stamp:
        return "unknown"
    key = str(scenario_id or "normal")
    if key not in cache:
        cache[key] = current_fingerprint(db, scenario_id=key)
    return cache_state({"instanceFingerprint": stamp}, cache[key])


def list_calibration_runs(db: Session, *, limit: int = 20, offset: int = 0) -> dict[str, Any]:
    """Corridas completadas del historial, de la más reciente a la más antigua."""
    condition = (
        OptimizationJobRecord.job_type == "calibration",
        OptimizationJobRecord.result_json.is_not(None),
    )
    stmt = select(OptimizationJobRecord).where(*condition)
    count_stmt = select(func.count()).select_from(OptimizationJobRecord).where(*condition)

    rows = db.scalars(
        stmt.order_by(OptimizationJobRecord.created_at.desc()).offset(offset).limit(limit)
    ).all()
    total = db.scalar(count_stmt) or 0

    fingerprints: dict[str, str] = {}
    items: list[dict[str, Any]] = []
    for row in rows:
        params = _params(row.params_json)
        stamp = params.get("instanceFingerprint")
        state = _state_for(db, stamp, params.get("scenario_id"), fingerprints)
        items.append(
            {
                "runId": row.id,
                "sweep": params.get("sweep"),
                "scenarioId": params.get("scenario_id"),
                "seed": params.get("seed"),
                "durationSeconds": params.get("durationSeconds"),
                "instanceFingerprint": stamp if isinstance(stamp, str) else None,
                "cacheState": state,
                "stale": state == "stale",
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


def get_calibration_run(db: Session, run_id: str) -> dict[str, Any] | None:
    """Payload completo de una corrida histórica (``None`` si no existe)."""
    row = db.get(OptimizationJobRecord, run_id)
    if row is None or row.job_type != "calibration" or not row.result_json:
        return None

    try:
        payload = json.loads(row.result_json)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Payload de calibración corrupto (%s): %s", run_id, exc)
        return None

    params = _params(row.params_json)
    stamp = params.get("instanceFingerprint")
    state = _state_for(db, stamp, params.get("scenario_id"), {})
    return {
        "runId": run_id,
        "sweep": params.get("sweep"),
        "scenarioId": params.get("scenario_id"),
        "seed": params.get("seed"),
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "instanceFingerprint": stamp if isinstance(stamp, str) else None,
        "cacheState": state,
        "stale": state == "stale",
        "payload": payload,
    }
