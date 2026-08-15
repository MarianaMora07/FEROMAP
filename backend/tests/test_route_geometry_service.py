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
    snap_lonlat_sequence,
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
    monkeypatch.setattr(
        route_geometry_service,
        "nearest_node_in_component",
        lambda _graph, _lon, _lat, _component: 1,
    )
    monkeypatch.setattr(
        route_geometry_service,
        "weakly_connected_component_nodes",
        lambda _graph, _node: {1, 2, 3, 4, 5},
    )
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
        patch.setattr(
            route_geometry_service,
            "nearest_node",
            lambda _graph, _lon, _lat: 1,
        )
        patch.setattr(
            route_geometry_service,
            "nearest_node_in_component",
            lambda _graph, _lon, _lat, _component: 1,
        )
        patch.setattr(
            route_geometry_service,
            "weakly_connected_component_nodes",
            lambda _graph, _node: {1, 2, 3, 4, 5},
        )
        patch.setattr(
            route_geometry_service,
            "build_tour_coordinates",
            lambda _graph, _seq: [
                [-62.715, 8.295],
                [-62.714, 8.2955],
                [-62.713, 8.296],
                [-62.712, 8.297],
                [-62.715, 8.295],
            ],
        )
        first = build_route_linestring_cached(route, waypoints)
        second = build_route_linestring_cached(route, waypoints)

    assert first == second
    assert len(first) > 3


def test_snap_lonlat_sequence_follows_road_graph(monkeypatch):
    dense = [
        [-62.715, 8.295],
        [-62.714, 8.2955],
        [-62.713, 8.296],
        [-62.712, 8.297],
    ]
    monkeypatch.setattr(route_geometry_service, "load_road_graph", lambda: _chain_graph())
    monkeypatch.setattr(route_geometry_service, "build_tour_coordinates", lambda _graph, _seq: dense)
    monkeypatch.setattr(route_geometry_service, "nearest_node", lambda _graph, _lon, _lat: 1)
    monkeypatch.setattr(
        route_geometry_service,
        "nearest_node_in_component",
        lambda _graph, _lon, _lat, _component: 1,
    )
    monkeypatch.setattr(
        route_geometry_service,
        "weakly_connected_component_nodes",
        lambda _graph, _node: {1, 2, 3, 4, 5},
    )

    snapped = snap_lonlat_sequence(
        [[-62.715, 8.295], [-62.712, 8.297]],
        include_depot=False,
    )

    assert snapped == dense
    assert len(snapped) > 2


def test_shortest_path_nodes_does_not_invent_straight_jump():
    from app.services.graph_service import shortest_path_nodes

    graph = nx.MultiDiGraph()
    graph.add_node(1, x=-62.71, y=8.29)
    graph.add_node(2, x=-62.80, y=8.25)
    # Dos nodos sin arista: no debe devolver [1, 2] (diagonal fantasma).
    assert shortest_path_nodes(graph, 1, 2) == [1]


def test_build_route_linestring_falls_back_when_graph_unavailable(monkeypatch):
    monkeypatch.setattr(route_geometry_service, "load_road_graph", lambda: None)
    clear_route_geometry_cache()

    waypoints = _make_waypoints(2)
    coords = build_route_linestring(waypoints, include_depot=True)

    assert len(coords) >= 3
    assert coords[0] == [-62.715, 8.295]
