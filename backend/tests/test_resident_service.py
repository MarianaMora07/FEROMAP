"""Tests del servicio de overview para residentes."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models import UserRole
from app.services.resident_service import resident_overview

from tests.resident_fixtures import (
    collection_point,
    optimized_route,
    resident_user,
    sample_proximity,
    sample_schedule,
    waypoint,
)


@patch("app.services.resident_service.build_resident_proximity")
@patch("app.services.resident_service.build_resident_schedule")
def test_resident_overview_scopes_points_and_routes(schedule_builder, proximity_builder):
    sector_id = 1
    user = resident_user(sector_id=sector_id)
    point_in = collection_point("CNT-001", sector_id=sector_id, fill_pct_source=85)
    point_other = collection_point("CNT-099", sector_id=99, fill_pct_source=40)
    route_in_sector = optimized_route(
        42,
        status="in_progress",
        vehicle_code="TR-08",
        waypoints=[
            waypoint(1, point_in, status="pending"),
            waypoint(2, collection_point("CNT-002", sector_id=sector_id), status="pending"),
        ],
    )
    route_other_sector = optimized_route(
        99,
        status="in_progress",
        vehicle_code="TR-99",
        waypoints=[waypoint(1, point_other, status="pending")],
    )

    db = MagicMock()
    points_result = MagicMock()
    points_result.all.return_value = [point_in]
    routes_result = MagicMock()
    routes_result.unique.return_value.all.return_value = [route_in_sector, route_other_sector]
    db.scalars.side_effect = [points_result, routes_result]
    schedule_builder.return_value = sample_schedule()
    proximity_builder.return_value = sample_proximity()

    with patch("app.services.resident_service.fill_level_pct", side_effect=lambda p: 85 if p.code == "CNT-001" else 40):
        payload = resident_overview(db, user)

    assert payload["sectorName"] == "Unare I"
    assert len(payload["collectionPoints"]) == 1
    assert payload["collectionPoints"][0]["id"] == "CNT-001"
    assert payload["collectionPoints"][0]["fillLevel"] == 85
    assert payload["stats"]["totalPoints"] == 1
    assert payload["stats"]["criticalPoints"] == 1
    assert len(payload["activeRoutesInSector"]) == 1
    assert payload["activeRoutesInSector"][0]["routeId"] == 42
    assert payload["activeRoutesInSector"][0]["vehicle"] == "TR-08"
    assert payload["activeRoutesInSector"][0]["stopsInSector"] == 2
    assert payload["proximity"]["vehicleCode"] == "TR-08"


@patch("app.services.resident_service.build_resident_proximity")
@patch("app.services.resident_service.build_resident_schedule")
def test_resident_overview_alert_when_no_schedule(schedule_builder, proximity_builder):
    user = resident_user()
    db = MagicMock()
    empty_points = MagicMock()
    empty_points.all.return_value = []
    empty_routes = MagicMock()
    empty_routes.unique.return_value.all.return_value = []
    db.scalars.side_effect = [empty_points, empty_routes]
    schedule_builder.return_value = sample_schedule(has_schedule=False)
    proximity_builder.return_value = sample_proximity(status="no_active_route")

    payload = resident_overview(db, user)

    assert payload["alerts"][0]["title"] == "Sin recolección programada"
    assert "Unare I" in payload["alerts"][0]["detail"]


def test_resident_overview_requires_resident_role():
    db = MagicMock()
    user = SimpleNamespace(role=UserRole.planificador, sector_id=1, sector=SimpleNamespace(name="Unare I"))

    with pytest.raises(HTTPException) as exc:
        resident_overview(db, user)

    assert exc.value.status_code == 403
    assert "residentes" in exc.value.detail.lower()


def test_resident_overview_requires_assigned_sector():
    db = MagicMock()
    user = resident_user(sector_id=None, sector_name="—")
    user.sector = None

    with pytest.raises(HTTPException) as exc:
        resident_overview(db, user)

    assert exc.value.status_code == 400
    assert "sector" in exc.value.detail.lower()
