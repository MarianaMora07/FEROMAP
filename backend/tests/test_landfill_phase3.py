"""Fase 3 — persistencia, GeoJSON, playback y KPIs de vertedero."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.domain.landfill_service_time import DEFAULT_LANDFILL_LAT, DEFAULT_LANDFILL_LON
from app.services.optimization_service import (
    CustomerNode,
    RouteSolution,
    VehicleUnit,
    _compute_kpis,
    _landfill_idx,
    _persist_routes,
    _route_geometry,
    _route_stops_for_geojson,
    _routes_to_geojson,
)
from app.services import route_geometry_service
from app.services.route_geometry_service import build_route_linestring
from app.services.route_playback_service import _build_stop
from tests.resident_fixtures import collection_point, optimized_route, waypoint
from tests.vrp_matrix_helpers import aco_multi_trip_kwargs, vrp_matrix


def _vehicle() -> VehicleUnit:
    return VehicleUnit(
        vehicle_id=1,
        driver_id=1,
        capacity_kg=40.0,
        fuel_rate=0.35,
        ideal_operators=6,
        assigned_operators=6,
    )


def test_compute_kpis_exposes_top_level_landfill_fields():
    n_customers = 4
    dist, time = vrp_matrix(n_customers, base=80.0)
    kwargs = aco_multi_trip_kwargs(n_customers, 1)
    landfill_idx = kwargs["landfill_idx"]
    route = [0, 1, landfill_idx, 2, 3, 4, landfill_idx, 0]
    optimized = RouteSolution(vehicle_routes=[route], distance_m=1000.0, duration_s=600.0)
    current = RouteSolution(vehicle_routes=[[0, 1, 2, 3, 4, 0]], distance_m=1200.0, duration_s=700.0)
    customers = [
        CustomerNode(i, f"C{i}", 0, 8.0, 50, -62.71 + i * 0.01, 8.29) for i in range(1, n_customers + 1)
    ]
    served = {c.code for c in customers[:3]}
    uncovered = [customers[3].code]

    kpis = _compute_kpis(
        current,
        optimized,
        customers,
        served,
        [_vehicle()],
        dist,
        time,
        unload_seconds=900,
        shift_budget_seconds=43200,
        uncovered_point_codes=uncovered,
    )

    assert kpis["landfillTrips"] == 2
    assert kpis["landfillTripsPerVehicle"] == 2.0
    assert kpis["unloadTimeHours"] == 0.5
    assert kpis["uncoveredPoints"] == 1
    assert kpis["shiftUtilizationPct"] >= 0
    assert kpis["durationBreakdown"]["optimized"]["landfillTrips"] == 2
    assert kpis["durationBreakdown"]["optimized"]["uncoveredPoints"] == 1


def test_route_stops_for_geojson_marks_landfill():
    customers = [
        CustomerNode(1, "C1", 0, 8.0, 50, -62.71, 8.29),
        CustomerNode(2, "C2", 0, 8.0, 50, -62.72, 8.30),
    ]
    landfill_idx = _landfill_idx(len(customers))
    stops = _route_stops_for_geojson(
        [0, 1, landfill_idx, 2, 0],
        customers,
        landfill_lon=-62.690,
        landfill_lat=8.280,
    )
    assert len(stops) == 3
    assert stops[1]["stopType"] == "landfill"
    assert stops[1]["code"] == "VERTEDERO"
    assert stops[0]["stopType"] == "collection"
    assert stops[2]["stopType"] == "collection"


def test_routes_to_geojson_includes_landfill_stops(monkeypatch):
    customers = [
        CustomerNode(1, "C1", 0, 8.0, 50, -62.71, 8.29),
        CustomerNode(2, "C2", 0, 8.0, 50, -62.72, 8.30),
    ]
    n_customers = len(customers)
    dist, time = vrp_matrix(n_customers, base=50.0)
    landfill_idx = _landfill_idx(n_customers)
    solution = RouteSolution(
        vehicle_routes=[[0, 1, landfill_idx, 2, 0]],
        distance_m=500.0,
        duration_s=300.0,
    )
    graph = MagicMock()

    monkeypatch.setattr(
        "app.services.optimization_service._route_geometry",
        lambda *args, **kwargs: [
            [-62.715, 8.295],
            [-62.71, 8.29],
            [-62.690, 8.280],
            [-62.72, 8.30],
            [-62.715, 8.295],
        ],
    )

    geojson = _routes_to_geojson(
        graph,
        solution,
        customers,
        dist,
        time,
        kind="optimized",
        label="Ruta optimizada",
        vehicles=[_vehicle()],
        landfill_lon=-62.690,
        landfill_lat=8.280,
        unload_seconds=900,
    )
    feature = geojson["features"][0]
    stops = feature["properties"]["stops"]
    landfill_stops = [stop for stop in stops if stop["stopType"] == "landfill"]
    assert len(landfill_stops) == 1
    assert landfill_stops[0]["code"] == "VERTEDERO"
    coords = feature["geometry"]["coordinates"]
    assert [-62.690, 8.280] in coords


def test_route_geometry_includes_landfill_coordinates(monkeypatch):
    customers = [
        CustomerNode(1, "C1", 0, 8.0, 50, -62.71, 8.29),
    ]
    landfill_idx = _landfill_idx(len(customers))
    graph = MagicMock()
    graph.nodes = {}

    monkeypatch.setattr("app.services.optimization_service.nearest_node", lambda g, lon, lat: 0)
    monkeypatch.setattr(
        "app.services.optimization_service.build_tour_coordinates",
        lambda g, nodes: [[-62.715, 8.295], [-62.71, 8.29], [-62.690, 8.280], [-62.715, 8.295]],
    )

    coords = _route_geometry(
        graph,
        customers,
        [0, 1, landfill_idx, 0],
        depot_lon=-62.715,
        depot_lat=8.295,
        landfill_lon=-62.690,
        landfill_lat=8.280,
    )
    assert [-62.690, 8.280] in coords


def test_persist_routes_writes_landfill_waypoints():
    n_customers = 2
    dist, time = vrp_matrix(n_customers, base=50.0)
    landfill_idx = _landfill_idx(n_customers)
    optimized = RouteSolution(
        vehicle_routes=[[0, 1, landfill_idx, 2, 0]],
        distance_m=400.0,
        duration_s=200.0,
    )
    current = RouteSolution(vehicle_routes=[[0, 1, 2, 0]], distance_m=450.0, duration_s=220.0)
    customers = [
        CustomerNode(1, "C1", 10, 8.0, 50, -62.71, 8.29),
        CustomerNode(2, "C2", 11, 8.0, 50, -62.72, 8.30),
    ]
    captured: list[SimpleNamespace] = []

    class FakeSession:
        def add(self, obj):
            captured.append(obj)

        def flush(self):
            route_objects = [obj for obj in captured if getattr(obj, "waypoints", None) is None and hasattr(obj, "route_kind")]
            for route in route_objects:
                if getattr(route, "id", None) is None:
                    route.id = len(route_objects)

    db = FakeSession()
    _persist_routes(
        db,
        simulation_id=99,
        vehicles=[_vehicle()],
        current_solution=current,
        optimized_solution=optimized,
        customers=customers,
        routes_geojson={},
        dist_matrix=dist,
        time_matrix=time,
        unload_seconds=900,
    )

    waypoints = [obj for obj in captured if getattr(obj, "waypoint_type", None)]
    landfill_wps = [wp for wp in waypoints if wp.waypoint_type == "landfill"]
    collection_wps = [wp for wp in waypoints if wp.waypoint_type == "collection"]
    assert len(landfill_wps) == 1
    assert landfill_wps[0].facility_code == "landfill"
    assert landfill_wps[0].collection_point_id is None
    assert len(collection_wps) == 4


def test_build_stop_landfill_returns_vertedero():
    wp = SimpleNamespace(
        sequence_order=2,
        waypoint_type="landfill",
        collection_point=None,
    )
    stop = _build_stop(wp, service_minutes=5, landfill_service_minutes=15)
    assert stop is not None
    assert stop["code"] == "VERTEDERO"
    assert stop["stopType"] == "landfill"
    assert stop["serviceMinutes"] == 15
    assert stop["lng"] == DEFAULT_LANDFILL_LON
    assert stop["lat"] == DEFAULT_LANDFILL_LAT


def test_route_geometry_service_includes_landfill_waypoint(monkeypatch):
    monkeypatch.setattr(route_geometry_service, "_road_line_coords", lambda *args, **kwargs: None)
    landfill_wp = SimpleNamespace(
        sequence_order=2,
        waypoint_type="landfill",
        collection_point=None,
    )
    collection_wp = waypoint(1, collection_point("CNT-001", lng=-62.712, lat=8.297))
    collection_wp.waypoint_type = "collection"
    coords = build_route_linestring([collection_wp, landfill_wp], include_depot=True)
    assert len(coords) >= 3
    assert [DEFAULT_LANDFILL_LON, DEFAULT_LANDFILL_LAT] in coords


def test_playback_route_with_landfill_stop():
    points = [collection_point("CNT-000", lng=-62.712, lat=8.297)]
    landfill_wp = SimpleNamespace(
        sequence_order=2,
        waypoint_type="landfill",
        collection_point=None,
        status="pending",
    )
    collection_wp = waypoint(1, points[0])
    collection_wp.waypoint_type = "collection"
    route = optimized_route(21, status="pending", vehicle_code="TR-08", waypoints=[collection_wp, landfill_wp])
    route.route_kind = "optimized"
    route.estimated_duration_seconds = 3600

    stop = _build_stop(landfill_wp, service_minutes=5, landfill_service_minutes=15)
    assert stop["code"] == "VERTEDERO"
    assert stop["serviceMinutes"] == 15
