"""Tests de integración plan del día ↔ mapa operativo."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.map_context_service import map_operational_context, planned_routes_geojson
from app.services.planning_service import ACTIVE_DAILY_PLAN_STATUSES, get_active_daily_plan
from tests.resident_fixtures import optimized_route, waypoint, collection_point


def test_get_active_daily_plan_returns_today_optimized_plan():
    db = MagicMock()
    plan = SimpleNamespace(id=9, status="optimized", operation_date=date.today())
    db.scalar.side_effect = [plan]

    result = get_active_daily_plan(db)

    assert result is plan


def test_get_active_daily_plan_returns_none_when_closed_without_routes():
    db = MagicMock()
    plan = SimpleNamespace(id=9, status="completed", operation_date=date.today())
    db.scalar.side_effect = [plan, None]

    result = get_active_daily_plan(db)

    assert result is None


def test_get_active_daily_plan_keeps_closed_plan_with_active_routes():
    db = MagicMock()
    plan = SimpleNamespace(id=9, status="completed", operation_date=date.today())
    db.scalar.side_effect = [plan, 42]

    result = get_active_daily_plan(db)

    assert result is plan


def test_active_daily_plan_statuses_cover_operational_flow():
    assert "optimized" in ACTIVE_DAILY_PLAN_STATUSES
    assert "dispatched" in ACTIVE_DAILY_PLAN_STATUSES


def test_planned_routes_geojson_scoped_without_plan_returns_empty():
    db = MagicMock()

    geojson = planned_routes_geojson(db, scoped_to_daily_plan=True, daily_plan_id=None)

    assert geojson == {"type": "FeatureCollection", "features": []}
    db.scalars.assert_not_called()


def test_planned_routes_geojson_filters_by_driver_and_daily_plan(monkeypatch):
    db = MagicMock()
    point = collection_point("CNT-001")
    route_a = optimized_route(1, status="pending", vehicle_code="TR-01", waypoints=[waypoint(1, point)])
    route_a.route_kind = "optimized"
    route_a.driver_id = 7
    route_a.daily_plan_id = 9

    db.scalars.return_value.unique.return_value.all.return_value = [route_a]

    monkeypatch.setattr(
        "app.services.map_context_service.build_route_linestring_cached",
        lambda *_args, **_kwargs: [[-62.715, 8.295], [-62.712, 8.297]],
    )

    geojson = planned_routes_geojson(db, driver_id=7, daily_plan_id=9)

    assert len(geojson["features"]) == 1
    assert geojson["features"][0]["properties"]["status"] == "pending"


def test_map_operational_context_uses_active_daily_plan(monkeypatch):
    db = MagicMock()
    active_plan = SimpleNamespace(id=11, status="optimized")

    captured: dict[str, object] = {}

    def fake_planned_routes(_db, **kwargs):
        captured["driver_id"] = kwargs.get("driver_id")
        captured["daily_plan_id"] = kwargs.get("daily_plan_id")
        captured["scoped_to_daily_plan"] = kwargs.get("scoped_to_daily_plan")
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": "route-1", "status": "pending"},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-62.715, 8.295], [-62.710, 8.298]],
                    },
                },
            ],
        }

    monkeypatch.setattr("app.services.map_context_service.get_active_daily_plan", lambda _db: active_plan)
    monkeypatch.setattr("app.services.map_context_service.planned_routes_geojson", fake_planned_routes)
    monkeypatch.setattr("app.services.map_context_service.live_fleet_view", lambda _db, driver_id=None: [])
    monkeypatch.setattr(
        "app.services.map_context_service.collection_points_geojson",
        lambda _db, sector=None, min_fill=None: {"type": "FeatureCollection", "features": []},
    )
    monkeypatch.setattr("app.services.map_context_service.list_recent_incidents", lambda _db, limit=4: [])

    context = map_operational_context(db, driver_id=3)

    assert captured["daily_plan_id"] == 11
    assert captured["scoped_to_daily_plan"] is True
    assert captured["driver_id"] == 3
    assert len(context["routes"]["features"]) == 1


def test_map_operational_context_without_active_plan_shows_no_routes(monkeypatch):
    db = MagicMock()

    def fake_planned_routes(_db, **kwargs):
        assert kwargs.get("scoped_to_daily_plan") is True
        assert kwargs.get("daily_plan_id") is None
        return {"type": "FeatureCollection", "features": []}

    monkeypatch.setattr("app.services.map_context_service.get_active_daily_plan", lambda _db: None)
    monkeypatch.setattr("app.services.map_context_service.planned_routes_geojson", fake_planned_routes)
    monkeypatch.setattr("app.services.map_context_service.live_fleet_view", lambda _db, driver_id=None: [])
    monkeypatch.setattr(
        "app.services.map_context_service.collection_points_geojson",
        lambda _db, sector=None, min_fill=None: {"type": "FeatureCollection", "features": []},
    )
    monkeypatch.setattr("app.services.map_context_service.list_recent_incidents", lambda _db, limit=4: [])

    context = map_operational_context(db)

    assert context["routes"]["features"] == []
