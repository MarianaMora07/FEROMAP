"""Fixtures compartidas para tests del módulo residente."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.db.models import UserRole


def resident_user(*, sector_id: int | None = 1, sector_name: str = "Unare I"):
    sector = SimpleNamespace(id=sector_id, name=sector_name) if sector_id is not None else None
    return SimpleNamespace(
        role=UserRole.residente,
        sector_id=sector_id,
        sector=sector,
    )


def planner_user():
    return SimpleNamespace(role=UserRole.planificador, sector_id=None, sector=None)


def collection_point(
    code: str,
    *,
    sector_id: int = 1,
    fill_pct_source: int = 50,
    lat: float = 8.27,
    lng: float = -62.75,
):
    return SimpleNamespace(
        code=code,
        sector_id=sector_id,
        current_fill_level=fill_pct_source,
        last_emptied_at=datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
        longitude=Decimal(str(lng)),
        latitude=Decimal(str(lat)),
    )


def waypoint(sequence: int, point, *, status: str = "pending"):
    return SimpleNamespace(
        sequence_order=sequence,
        status=status,
        collection_point=point,
    )


def optimized_route(
    route_id: int,
    *,
    status: str,
    vehicle_code: str,
    waypoints: list,
):
    vehicle = SimpleNamespace(code=vehicle_code)
    return SimpleNamespace(
        id=route_id,
        status=status,
        vehicle=vehicle,
        waypoints=waypoints,
    )


def sample_schedule(*, has_schedule: bool = True, is_collection_day: bool = True) -> dict:
    if not has_schedule:
        return {
            "collectionDays": "—",
            "window": "07:00 — 12:00",
            "nextCollection": "Sin recolección programada",
            "nextCollectionAt": None,
            "frequency": "—",
            "isCollectionDay": False,
            "hasWeeklyPlan": False,
            "hasSchedule": False,
            "source": "none",
            "calendar": [],
        }
    return {
        "collectionDays": "Lunes, Miércoles, Viernes",
        "window": "07:00 — 12:00",
        "nextCollection": "Viernes 15/08",
        "nextCollectionAt": "2026-08-15T11:00:00+00:00",
        "frequency": "3x/semana",
        "isCollectionDay": is_collection_day,
        "hasWeeklyPlan": True,
        "hasSchedule": True,
        "source": "weekly_plan",
        "calendar": [],
    }


def sample_proximity(*, status: str = "approaching") -> dict:
    return {
        "status": status,
        "vehicleCode": "TR-08",
        "routeId": 42,
        "estimatedMinutes": 18,
        "stopsBeforeSector": 2,
        "nextStopInSector": "CNT-001",
        "completedStopsInSector": 0,
        "totalStopsInSector": 3,
        "lastUpdatedAt": datetime.now(timezone.utc).isoformat(),
    }
