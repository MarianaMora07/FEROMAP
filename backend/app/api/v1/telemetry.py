"""Telemetría del frontend: reporte de errores no controlados.

El frontend envía aquí los errores que no pudo manejar en una vista; se registran
en el log estructurado (con request-id) y se cuentan en `/metrics`.

No exige autenticación a propósito: los fallos de login o de arranque también
deben poder reportarse.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.metrics import record_frontend_error

router = APIRouter(prefix="/telemetry", tags=["telemetry"])
logger = logging.getLogger("feromap.frontend")


class FrontendErrorReport(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    kind: str = Field(default="error", max_length=60)
    stack: str | None = Field(default=None, max_length=8000)
    url: str | None = Field(default=None, max_length=2000)
    context: dict[str, Any] | None = None


@router.post("/frontend-error")
def report_frontend_error(payload: FrontendErrorReport) -> dict[str, bool]:
    record_frontend_error(payload.kind)
    logger.warning(
        "frontend_error",
        extra={
            "event": "frontend_error",
            "kind": payload.kind,
            "frontend_message": payload.message,
            "frontend_url": payload.url,
        },
    )
    return {"ok": True}
