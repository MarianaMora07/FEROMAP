"""Métricas reales de ruta derivadas al cerrar el día (Fase 4)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from app.services.operations_service import route_actual_distance_km


def _point(latitude: float, longitude: float) -> SimpleNamespace:
    return SimpleNamespace(latitude=latitude, longitude=longitude)


def _waypoint(order: int, status: str, point: SimpleNamespace | None) -> SimpleNamespace:
    return SimpleNamespace(sequence_order=order, status=status, collection_point=point)


def test_route_actual_distance_sums_graph_legs():
    route = SimpleNamespace(
        waypoints=[
            _waypoint(1, "completed", _point(8.28, -62.71)),
            _waypoint(2, "completed", _point(8.29, -62.72)),
            _waypoint(3, "pending", _point(8.30, -62.73)),
        ]
    )
    with (
        patch("app.services.graph_service.load_road_graph", return_value=object()),
        patch("app.services.graph_service.nearest_node", side_effect=[1, 2]),
        patch(
            "app.services.graph_service.path_metrics_between_nodes",
            return_value=(2500.0, 300.0),
        ),
    ):
        assert route_actual_distance_km(route) == 2.5


def test_route_actual_distance_requires_two_completed_stops():
    route = SimpleNamespace(
        waypoints=[
            _waypoint(1, "completed", _point(8.28, -62.71)),
            _waypoint(2, "pending", _point(8.29, -62.72)),
        ]
    )
    assert route_actual_distance_km(route) is None


def test_route_actual_distance_returns_none_when_graph_unavailable():
    route = SimpleNamespace(
        waypoints=[
            _waypoint(1, "completed", _point(8.28, -62.71)),
            _waypoint(2, "completed", _point(8.29, -62.72)),
        ]
    )
    with patch(
        "app.services.graph_service.load_road_graph",
        side_effect=RuntimeError("sin grafo"),
    ):
        assert route_actual_distance_km(route) is None
