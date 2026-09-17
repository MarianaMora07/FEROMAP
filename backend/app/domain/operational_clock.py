"""Reloj operativo: instantes de la jornada en la zona horaria configurada (Fase 13.5).

Las horas de la operación —inicio de jornada, ETA por parada, arranque del playback— son
horas **locales** de la zona operativa (por defecto ``America/Caracas``), no UTC. Este
módulo centraliza su construcción para que todas las rutas de código coincidan.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, tzinfo, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.domain.landfill_service_time import DEFAULT_WORK_START, parse_time_hhmm

DEFAULT_OPERATIONAL_TIMEZONE = "America/Caracas"


def resolve_operational_timezone(name: str | None = None) -> tzinfo:
    """Zona horaria operativa; cae a UTC si el nombre es vacío, inválido o inexistente."""
    candidate = (name or "").strip() or DEFAULT_OPERATIONAL_TIMEZONE
    try:
        return ZoneInfo(candidate)
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def operational_departure_at(
    operation_date: date | None = None,
    work_start: str | None = None,
    *,
    tz: tzinfo | None = None,
    timezone_name: str | None = None,
    extra_minutes: int = 0,
) -> datetime:
    """Salida de la flota: fecha de operación + inicio de jornada, en hora local.

    ``tz`` tiene prioridad sobre ``timezone_name`` (útil cuando el llamador ya resolvió la
    zona desde la configuración). Sin fecha usa el día actual **de la zona operativa**.
    ``extra_minutes`` permite un desfase de demo (p. ej. 15 min para escalonar rutas).
    """
    zone = tz if tz is not None else resolve_operational_timezone(timezone_name)
    base_date = operation_date or datetime.now(zone).date()
    try:
        hour, minute = parse_time_hhmm(work_start or DEFAULT_WORK_START)
    except ValueError:
        hour, minute = 6, 0
    return datetime.combine(base_date, time(hour, minute), tzinfo=zone) + timedelta(
        minutes=max(0, int(extra_minutes))
    )
