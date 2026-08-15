"""Tests de map_context_service: bbox, rutas planificadas y colores."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import route_geometry_service
from app.services.map_context_service import (
    PLANNED_ROUTE_STATUSES,
    ROUTE_COLORS,
    _in_bbox,
    _parse_bbox,
    map_operational_context,
    planned_routes_geojson,
)
from tests.resident_fixtures import collection_point, optimized_route, waypoint
from tests.db_fixtures import mock_db_with_settings


def _make_waypoints(count: int = 3):
    points = [
        collection_point(f"CNT-{idx:03d}", lng=-62.712 + idx * 0.003, lat=8.297 + idx * 0.002)
        for idx in range(count)
    ]
    return [waypoint(sequence=idx + 1, point=points[idx]) for idx in range(count)]


def test_parse_bbox_validates_unare_format():
    assert _parse_bbox("-62.81,8.24,-62.69,8.31") == (-62.81, 8.24, -62.69, 8.31)
    assert _parse_bbox("invalid") is None
    assert _parse_bbox(None) is None


def test_in_bbox_accepts_points_inside_unare():
    bbox = (-62.81, 8.24, -62.69, 8.31)
    assert _in_bbox(-62.715, 8.295, bbox) is True
    assert _in_bbox(-63.5, 9.5, bbox) is False


def test_planned_routes_geojson_includes_pending_route_with_color():
    pending = optimized_route(
        12,
        status="pending",
        vehicle_code="TR-08",
        waypoints=_make_waypoints(3),
    )
    pending.route_kind = "optimized"
    pending.updated_at = datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc)

    db = mock_db_with_settings(scalars_result=[pending])

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(
            route_geometry_service,
            "build_route_linestring_cached",
            lambda route, wps, include_depot=True: [
                [-62.715, 8.295],
                [-62.712, 8.297],
                [-62.709, 8.299],
            ],
        )
        geojson = planned_routes_geojson(db)

    assert len(geojson["features"]) == 1
    props = geojson["features"][0]["properties"]
    assert props["status"] == "pending"
    assert props["routeId"] == 12
    assert props["vehicleId"] == "TR-08"
    assert props["routeKind"] == "optimized"
    assert props["color"] == ROUTE_COLORS[0]
    assert props["waypointsTotal"] == 3
    assert props["waypointsDone"] == 0


def test_planned_routes_geojson_assigns_rotating_colors():
    routes = []
    for idx, route_id in enumerate((12, 13), start=0):
        route = optimized_route(
            route_id,
            status="pending" if idx == 0 else "in_progress",
            vehicle_code=f"TR-{idx:02d}",
            waypoints=_make_waypoints(2),
        )
        route.route_kind = "optimized"
        route.updated_at = datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc)
        routes.append(route)

    db = mock_db_with_settings(scalars_result=routes)

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(
            route_geometry_service,
            "build_route_linestring_cached",
            lambda route, wps, include_depot=True: [[-62.715, 8.295], [-62.712, 8.297]],
        )
        geojson = planned_routes_geojson(db)

    colors = [feature["properties"]["color"] for feature in geojson["features"]]
    assert colors == [ROUTE_COLORS[0], ROUTE_COLORS[1]]


def test_map_operational_context_filters_routes_outside_bbox(monkeypatch):
    db = MagicMock()

    def fake_planned_routes(_db, **kwargs):
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": "route-1", "status": "in_progress", "color": "#34D634"},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-62.715, 8.295], [-62.710, 8.298]],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {"id": "route-2", "status": "pending", "color": "#1143F3"},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-63.5, 9.5], [-63.4, 9.6]],
                    },
                },
            ],
        }

    monkeypatch.setattr(
        "app.services.map_context_service.planned_routes_geojson",
        fake_planned_routes,
    )
    monkeypatch.setattr("app.services.map_context_service.get_active_daily_plan", lambda _db: None)
    monkeypatch.setattr("app.services.map_context_service.live_fleet_view", lambda _db, driver_id=None: [])
    monkeypatch.setattr(
        "app.services.map_context_service.collection_points_geojson",
        lambda _db, sector=None, min_fill=None: {"type": "FeatureCollection", "features": []},
    )
    monkeypatch.setattr("app.services.map_context_service.list_recent_incidents", lambda _db, limit=4: [])
    monkeypatch.setattr(
        "app.services.map_context_service._build_map_metrics",
        lambda _db, active_routes=0: [],
    )
    monkeypatch.setattr(
        "app.services.map_context_service.resolve_operational_facilities",
        lambda _db: SimpleNamespace(
            depot=(8.295, -62.715),
            landfill=(8.28, -62.69),
            landfill_unload_minutes=15,
            shift_budget_seconds=43200,
            work_start="06:00",
            work_end="18:00",
        ),
    )

    context = map_operational_context(db, bbox="-62.81,8.24,-62.69,8.31")
    route_ids = {feature["properties"]["id"] for feature in context["routes"]["features"]}

    assert route_ids == {"route-1"}


def test_planned_route_statuses_exclude_completed():
    assert PLANNED_ROUTE_STATUSES == ("pending", "in_progress")
    assert "completed" not in PLANNED_ROUTE_STATUSES
