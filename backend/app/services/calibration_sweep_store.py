"""Almacén de evidencia de calibración del motor (Fase 13 · vista de calibración).

La base de datos es la **única fuente de verdad**:

- cada corrida completada de un barrido deja una fila en ``calibration_sweeps`` con el
  payload íntegro del contrato;
- la lectura «vigente» de un barrido es su fila **más reciente**;
- el historial son las filas anteriores (misma tabla, sin concepto aparte).

El sello de instancia sigue informando: una fila es ``stale`` si la instancia cambió
desde que se generó (puntos/vehículos/zonas, depósito, vertedero o jornada), ``fresh`` si
describe la instancia actual y ``unknown`` si no lleva sello.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CalibrationSweep
from app.services.instance_fingerprint import cache_state, current_fingerprint

logger = logging.getLogger(__name__)


def _as_decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return Decimal(str(round(float(value), 2)))
    except (TypeError, ValueError):
        return None


def _parse_generated_at(value: Any) -> datetime:
    """Instante de generación declarado por el payload (o «ahora» si no es válido)."""
    parsed: datetime | None = None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            parsed = None
    if parsed is None:
        return datetime.now(timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _summary(payload: dict[str, Any]) -> dict[str, Any]:
    """Resumen tipado: corridas totales/fallidas y la mejor distancia (KPI D2)."""
    runs = payload.get("runs") or []
    valid = [
        run
        for run in runs
        if isinstance(run, dict) and not run.get("error") and run.get("distanceKmOptimized") is not None
    ]
    distances = [float(run["distanceKmOptimized"]) for run in valid]
    return {
        "runs_total": len(runs),
        "runs_failed": sum(1 for run in runs if isinstance(run, dict) and run.get("error")),
        "best_distance_km": min(distances) if distances else None,
    }


def record_sweep(
    db: Session,
    *,
    sweep: str,
    payload: dict[str, Any],
    instance_fingerprint: str | None = None,
) -> CalibrationSweep:
    """Guarda una corrida **completada** (se llama solo al terminar con éxito).

    Va con ``commit`` para que la evidencia quede persistida aunque el proceso muera
    después; si el barrido se cancela, no se llega aquí y no queda rastro.
    """
    summary = _summary(payload)
    row = CalibrationSweep(
        sweep=sweep,
        scenario_id=str(payload.get("scenarioId") or "normal"),
        seed=int(payload.get("seed") or 0),
        duration_seconds=_as_decimal(payload.get("durationSeconds")),
        runs_total=summary["runs_total"],
        runs_failed=summary["runs_failed"],
        best_distance_km=_as_decimal(summary["best_distance_km"]),
        instance_fingerprint=instance_fingerprint or payload.get("instanceFingerprint"),
        payload_json=json.dumps(payload, ensure_ascii=False, default=str),
        generated_at=_parse_generated_at(payload.get("generatedAt")),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _payload_of(row: CalibrationSweep) -> dict[str, Any] | None:
    try:
        payload = json.loads(row.payload_json)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Payload de calibración corrupto (sweep %s): %s", row.id, exc)
        return None
    return payload if isinstance(payload, dict) else None


def _latest_stmt(sweep: str):
    return (
        select(CalibrationSweep)
        .where(CalibrationSweep.sweep == sweep)
        .order_by(CalibrationSweep.created_at.desc(), CalibrationSweep.id.desc())
        .limit(1)
    )


def latest_row(db: Session, *, sweep: str) -> CalibrationSweep | None:
    """Fila vigente del barrido (la más reciente), o ``None`` si nunca corrió."""
    return db.scalars(_latest_stmt(sweep)).first()


def latest_payload(db: Session, *, sweep: str) -> dict[str, Any] | None:
    """Payload vigente del barrido, o ``None`` si no hay (o está corrupto)."""
    row = latest_row(db, sweep=sweep)
    if row is None:
        return None
    return _payload_of(row)


def latest_payload_of_phase(
    db: Session, *, sweep: str, phase: str, limit: int = 100
) -> dict[str, Any] | None:
    """Payload más reciente de un barrido con una ``phase`` concreta.

    El protocolo de calibración metodológica guarda todas sus fases en el mismo barrido
    (``method``) y las distingue por el campo ``phase`` de la raíz del payload. La lectura
    «vigente» del barrido completo no sirve para eso: cada fase necesita **su** última corrida.
    """
    rows = db.scalars(
        select(CalibrationSweep)
        .where(CalibrationSweep.sweep == sweep)
        .order_by(CalibrationSweep.created_at.desc(), CalibrationSweep.id.desc())
        .limit(limit)
    ).all()
    for row in rows:
        payload = _payload_of(row)
        if payload is not None and payload.get("phase") == phase:
            return payload
    return None


def payloads_of_phase(
    db: Session, *, sweep: str, phase: str, limit: int = 100
) -> list[tuple[int, dict[str, Any]]]:
    """Pares ``(id, payload)`` de un barrido con una ``phase``, del más reciente al más antiguo.

    Es la lectura que necesita el reporte de C8: no siempre se quiere la corrida **más
    reciente** de una fase (puede ser una verificación de fontanería con 2 semillas), sino la
    **más completa**. El reporte elige con este listado y cita el id que usó.
    """
    rows = db.scalars(
        select(CalibrationSweep)
        .where(CalibrationSweep.sweep == sweep)
        .order_by(CalibrationSweep.created_at.desc(), CalibrationSweep.id.desc())
        .limit(limit)
    ).all()
    entries: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        payload = _payload_of(row)
        if payload is not None and payload.get("phase") == phase:
            entries.append((int(row.id), payload))
    return entries


def _state_for(db: Session, stamp: Any, scenario_id: Any, cache: dict[str, str]) -> str:
    """Estado del sello de una corrida frente a la instancia vigente de su escenario."""
    if not isinstance(stamp, str) or not stamp:
        return "unknown"
    key = str(scenario_id or "normal")
    if key not in cache:
        cache[key] = current_fingerprint(db, scenario_id=key)
    return cache_state({"instanceFingerprint": stamp}, cache[key])


def _row_to_item(row: CalibrationSweep, db: Session, cache: dict[str, str]) -> dict[str, Any]:
    state = _state_for(db, row.instance_fingerprint, row.scenario_id, cache)
    return {
        "runId": str(row.id),
        "sweep": row.sweep,
        "scenarioId": row.scenario_id,
        "seed": row.seed,
        "durationSeconds": float(row.duration_seconds) if row.duration_seconds is not None else None,
        "instanceFingerprint": row.instance_fingerprint,
        "cacheState": state,
        "stale": state == "stale",
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def list_sweeps(db: Session, *, limit: int = 20, offset: int = 0) -> dict[str, Any]:
    """Historial de corridas, de la más reciente a la más antigua."""
    rows = db.scalars(
        select(CalibrationSweep)
        .order_by(CalibrationSweep.created_at.desc(), CalibrationSweep.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    total = db.scalar(select(func.count()).select_from(CalibrationSweep)) or 0

    fingerprints: dict[str, str] = {}
    return {
        "items": [_row_to_item(row, db, fingerprints) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_sweep(db: Session, run_id: str) -> dict[str, Any] | None:
    """Payload completo de una corrida (``run_id`` es el id entero como texto)."""
    try:
        key = int(run_id)
    except (TypeError, ValueError):
        return None
    row = db.get(CalibrationSweep, key)
    if row is None:
        return None
    payload = _payload_of(row)
    if payload is None:
        return None
    return {**_row_to_item(row, db, {}), "payload": payload}
