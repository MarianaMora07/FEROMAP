"""Tests de proximidad del camión para residentes."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models import UserRole
from app.services.resident_proximity_service import build_resident_proximity


def _user(sector_id: int = 1):
    return SimpleNamespace(role=UserRole.residente, sector_id=sector_id)


def _point(code: str, sector_id: int, lat: float = 8.27, lng: float = -62.75):
    return SimpleNamespace(
        code=code,
        sector_id=sector_id,
        latitude=Decimal(str(lat)),
        longitude=Decimal(str(lng)),
    )


def _waypoint(sequence: int, point, status: str = "pending"):
    return SimpleNamespace(
        sequence_order=sequence,
        status=status,
        collection_point=point,
    )


def _route(route_id: int, status: str, vehicle_code: str, waypoints: list):
    vehicle = SimpleNamespace(code=vehicle_code)
    return SimpleNamespace(
        id=route_id,
        status=status,
        vehicle=vehicle,
        waypoints=waypoints,
    )


@patch("app.services.resident_proximity_service.build_resident_schedule")
@patch("app.services.resident_proximity_service.live_fleet_view")
@patch("app.services.resident_proximity_service._load_routes_for_sector")
def test_proximity_approaching(load_routes, live_fleet, schedule_builder):
    sector_id = 1
    point_a = _point("CNT-001", sector_id)
    point_b = _point("CNT-002", sector_id)
    other = _point("CNT-099", 99)
    route = _route(
        42,
        "in_progress",
        "TR-08",
        [
            _waypoint(1, other, "pending"),
            _waypoint(2, other, "pending"),
            _waypoint(3, point_a, "pending"),
            _waypoint(4, point_b, "pending"),
        ],
    )
    load_routes.return_value = [route]
    live_fleet.return_value = [{"id": "TR-08", "routeId": 42, "lat": 8.26, "lng": -62.76}]
    schedule_builder.return_value = {"isCollectionDay": True}

    db = MagicMock()
    db.scalar.return_value = point_a

    result = build_resident_proximity(db, _user(sector_id))

    assert result["status"] == "approaching"
    assert result["vehicleCode"] == "TR-08"
    assert result["routeId"] == 42
    assert result["stopsBeforeSector"] == 2
    assert result["nextStopInSector"] == "CNT-001"
    assert result["estimatedMinutes"] is not None


@patch("app.services.resident_proximity_service.build_resident_schedule")
@patch("app.services.resident_proximity_service.live_fleet_view")
@patch("app.services.resident_proximity_service._load_routes_for_sector")
def test_proximity_in_sector(load_routes, live_fleet, schedule_builder):
    sector_id = 1
    point_a = _point("CNT-001", sector_id)
    point_b = _point("CNT-002", sector_id)
    route = _route(
        7,
        "in_progress",
        "TR-03",
        [
            _waypoint(1, point_a, "completed"),
            _waypoint(2, point_b, "pending"),
        ],
    )
    load_routes.return_value = [route]
    live_fleet.return_value = []
    schedule_builder.return_value = {"isCollectionDay": True}

    result = build_resident_proximity(MagicMock(), _user(sector_id))

    assert result["status"] == "in_sector"
    assert result["completedStopsInSector"] == 1
    assert result["totalStopsInSector"] == 2


@patch("app.services.resident_proximity_service.build_resident_schedule")
@patch("app.services.resident_proximity_service._load_routes_for_sector")
def test_proximity_no_active_route(load_routes, schedule_builder):
    load_routes.return_value = []
    schedule_builder.return_value = {"isCollectionDay": True}

    result = build_resident_proximity(MagicMock(), _user())

    assert result["status"] == "no_active_route"
    assert result["vehicleCode"] is None


def test_proximity_requires_sector():
    with pytest.raises(HTTPException) as exc:
        build_resident_proximity(MagicMock(), SimpleNamespace(role=UserRole.residente, sector_id=None))
    assert exc.value.status_code == 400


def test_proximity_requires_resident_role():
    with pytest.raises(HTTPException) as exc:
        build_resident_proximity(
            MagicMock(),
            SimpleNamespace(role=UserRole.conductor, sector_id=1),
        )
    assert exc.value.status_code == 403
    assert "residentes" in exc.value.detail.lower()
