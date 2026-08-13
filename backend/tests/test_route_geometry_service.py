"""Tests de geometría vial (OSMnx + fallback recto)."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import networkx as nx
import pytest
from shapely.geometry import LineString

from app.services import route_geometry_service
from app.services.route_geometry_service import (
    build_route_linestring,
    build_route_linestring_cached,
    clear_route_geometry_cache,
)
from tests.resident_fixtures import collection_point, waypoint


def _chain_graph() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph()
    node_coords = {
        1: (-62.715, 8.295),
        2: (-62.712, 8.297),
        3: (-62.709, 8.299),
        4: (-62.706, 8.301),
        5: (-62.703, 8.303),
    }
    for node_id, (x, y) in node_coords.items():
        graph.add_node(node_id, x=x, y=y)

    dense_geometry = LineString(
        [
            (-62.715, 8.295),
            (-62.714, 8.2955),
            (-62.713, 8.296),
            (-62.712, 8.297),
        ]
    )
    graph.add_edge(
        1,
        2,
        0,
        length=800.0,
        travel_time=90.0,
        highway="residential",
        geometry=dense_geometry,
    )
    graph.add_edge(2, 1, 0, length=800.0, travel_time=90.0, highway="residential")
    for orig, dest in ((2, 3), (3, 4), (4, 5), (5, 4), (4, 3), (3, 2), (4, 1), (1, 4)):
        graph.add_edge(orig, dest, 0, length=600.0, travel_time=70.0, highway="residential")
    return graph


def _make_waypoints(count: int = 3):
    points = [
        collection_point(f"CNT-{idx:03d}", lng=-62.712 + idx * 0.003, lat=8.297 + idx * 0.002)
        for idx in range(count)
    ]
    return [waypoint(sequence=idx + 1, point=points[idx]) for idx in range(count)]


def test_build_route_linestring_follows_road_graph_with_dense_geometry(monkeypatch):
    dense = [
        [-62.715, 8.295],
        [-62.714, 8.2955],
        [-62.713, 8.296],
        [-62.712, 8.297],
        [-62.709, 8.299],
        [-62.706, 8.301],
        [-62.715, 8.295],
    ]
    monkeypatch.setattr(route_geometry_service, "load_road_graph", lambda: _chain_graph())
    monkeypatch.setattr(route_geometry_service, "build_tour_coordinates", lambda _graph, _seq: dense)
    monkeypatch.setattr(route_geometry_service, "nearest_node", lambda _graph, _lon, _lat: 1)
    clear_route_geometry_cache()

    waypoints = _make_waypoints(3)
    road_coords = build_route_linestring(waypoints, include_depot=True)
    straight_coords = route_geometry_service._straight_line_coords(
        [
            coord
            for wp in waypoints
            if (coord := route_geometry_service._waypoint_lon_lat(wp)) is not None
        ],
        include_depot=True,
    )

    assert len(road_coords) > 3
    assert len(road_coords) > len(straight_coords)
    assert road_coords == dense


def test_build_route_linestring_cached_reuses_geometry():
    clear_route_geometry_cache()
    route = SimpleNamespace(
        id=7,
        status="pending",
        updated_at=datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc),
    )
    waypoints = _make_waypoints(3)

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(route_geometry_service, "load_road_graph", lambda: _chain_graph())
        first = build_route_linestring_cached(route, waypoints)
        second = build_route_linestring_cached(route, waypoints)

    assert first == second
    assert len(first) > 3


def test_build_route_linestring_falls_back_when_graph_unavailable(monkeypatch):
    monkeypatch.setattr(route_geometry_service, "load_road_graph", lambda: None)
    clear_route_geometry_cache()

    waypoints = _make_waypoints(2)
    coords = build_route_linestring(waypoints, include_depot=True)

    assert len(coords) >= 3
    assert coords[0] == [-62.715, 8.295]
