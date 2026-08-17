"""Resolución de depósito, vertedero y jornada desde configuración operativa."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.domain.landfill_service_time import (
    DEFAULT_DEPOT_LAT,
    DEFAULT_DEPOT_LON,
    DEFAULT_LANDFILL_LAT,
    DEFAULT_LANDFILL_LON,
    DEFAULT_LANDFILL_UNLOAD_MINUTES,
    DEFAULT_WORK_END,
    DEFAULT_WORK_START,
    landfill_unload_seconds,
    shift_budget_seconds,
)
from app.services.admin_service import get_operational_settings


@dataclass(frozen=True)
class ResolvedOperationalFacilities:
    depot: tuple[float, float]
    landfill: tuple[float, float]
    unload_seconds: int
    shift_budget_seconds: int
    work_start: str
    work_end: str
    landfill_unload_minutes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "depot": {"lon": self.depot[0], "lat": self.depot[1]},
            "landfill": {"lon": self.landfill[0], "lat": self.landfill[1]},
            "unloadSeconds": self.unload_seconds,
            "shiftBudgetSeconds": self.shift_budget_seconds,
            "workStart": self.work_start,
            "workEnd": self.work_end,
            "landfillUnloadMinutes": self.landfill_unload_minutes,
        }


def _normalize_lon_lat(
    lon: float | None,
    lat: float | None,
    *,
    default_lon: float,
    default_lat: float,
) -> tuple[float, float]:
    """Devuelve (lon, lat). Corrige settings legacy con campos intercambiados en Unare."""
    resolved_lon = default_lon if lon is None else float(lon)
    resolved_lat = default_lat if lat is None else float(lat)
    if abs(resolved_lon) < 20 and abs(resolved_lat) > 20:
        resolved_lon, resolved_lat = resolved_lat, resolved_lon
    return resolved_lon, resolved_lat


def resolve_operational_facilities(db: Session) -> ResolvedOperationalFacilities:
    """Lee settings de BD con fallback a constantes de contrato (ADR-004)."""
    settings = get_operational_settings(db)
    work_start = settings.work_start or DEFAULT_WORK_START
    work_end = settings.work_end or DEFAULT_WORK_END
    unload_minutes = settings.landfill_unload_minutes or DEFAULT_LANDFILL_UNLOAD_MINUTES
    depot_lon, depot_lat = _normalize_lon_lat(
        settings.depot_lon,
        settings.depot_lat,
        default_lon=DEFAULT_DEPOT_LON,
        default_lat=DEFAULT_DEPOT_LAT,
    )
    landfill_lon, landfill_lat = _normalize_lon_lat(
        settings.landfill_lon,
        settings.landfill_lat,
        default_lon=DEFAULT_LANDFILL_LON,
        default_lat=DEFAULT_LANDFILL_LAT,
    )
    return ResolvedOperationalFacilities(
        depot=(depot_lon, depot_lat),
        landfill=(landfill_lon, landfill_lat),
        unload_seconds=landfill_unload_seconds(unload_minutes),
        shift_budget_seconds=shift_budget_seconds(work_start, work_end),
        work_start=work_start,
        work_end=work_end,
        landfill_unload_minutes=unload_minutes,
    )
