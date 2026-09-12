"""Ejecución idempotente de operaciones mutables (Fase 4).

``run_idempotent`` guarda el resultado de una operación bajo una clave y lo
reproduce ante reintentos con la misma clave, evitando efectos duplicados
(p. ej. despachar dos veces las mismas rutas).
"""

from __future__ import annotations

import json
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import IdempotencyRecord

_MAX_KEY_LENGTH = 120
_MAX_SCOPE_LENGTH = 80


def run_idempotent(
    db: Session,
    *,
    scope: str,
    key: str | None,
    handler: Callable[[], Any],
    enabled: bool = True,
) -> Any:
    if not enabled or not key:
        return handler()

    normalized_key = key.strip()[:_MAX_KEY_LENGTH]
    normalized_scope = scope.strip()[:_MAX_SCOPE_LENGTH]

    existing = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.scope == normalized_scope,
            IdempotencyRecord.key == normalized_key,
        )
    )
    if existing is not None:
        if existing.status == "completed" and existing.response_json:
            return json.loads(existing.response_json)
        # Misma clave todavía en curso: no repetir el efecto.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Operación en curso con la misma Idempotency-Key",
        )

    record = IdempotencyRecord(scope=normalized_scope, key=normalized_key, status="in_progress")
    db.add(record)
    db.flush()

    result = handler()

    record.status = "completed"
    record.response_json = json.dumps(result, ensure_ascii=False, default=str)
    db.flush()
    return result
