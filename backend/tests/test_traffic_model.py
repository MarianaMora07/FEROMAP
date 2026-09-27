"""Tests del modelo de tráfico por franja horaria (Tarea 4 — Opción A)."""

from __future__ import annotations

import networkx as nx
import pytest

from app.domain.traffic_profile import (
    CONGESTION_BANDS,
    congestion_band_for_hour,
    congestion_factor_for_hour,
    is_traffic_weighted,
    normalize_departure_hour,
)
from app.services.distance_matrix_cache import (
    build_matrix_cache_key,
    find_incremental_parent_cache,
    save_distance_matrix_cache,
)
from app.services.graph_service import (
    apply_scenario_weights,
    path_metrics_between_nodes,
)


def _two_corridor_graph() -> nx.MultiDiGraph:
    """Dos corredores 1→2: directo (primary, 1000 m, 100 s) y alterno 1→3→2
    (residential, 2000 m, 90 s en total). El alterno es más largo pero más rápido."""
    graph = nx.MultiDiGraph()
    graph.add_node(1, x=-62.715, y=8.295)
    graph.add_node(2, x=-62.710, y=8.300)
    graph.add_node(3, x=-62.712, y=8.297)
    for u, v in ((1, 2), (2, 1)):
        graph.add_edge(u, v, 0, length=1000.0, travel_time=100.0, highway="primary")
    for u, v in ((1, 3), (3, 1), (3, 2), (2, 3)):
        graph.add_edge(u, v, 0, length=1000.0, travel_time=45.0, highway="residential")
    return graph


# --- Perfil de congestión ---------------------------------------------------


def test_band_factors_by_hour():
    assert congestion_factor_for_hour(7) == pytest.approx(1.30)
    assert congestion_factor_for_hour(10) == pytest.approx(1.0)
    assert congestion_factor_for_hour(18) == pytest.approx(1.25)
    assert congestion_factor_for_hour(20) == pytest.approx(0.90)
    assert congestion_factor_for_hour(None) == pytest.approx(1.0)


def test_band_display_label_mentions_range_and_factor():
    band = congestion_band_for_hour(7)
    assert band is not None
    assert "06:00–09:00" in band.display_label()
    assert "1.3" in band.display_label()
    assert len(CONGESTION_BANDS) >= 6


def test_normalize_departure_hour():
    assert normalize_departure_hour(None) is None
    assert normalize_departure_hour(7) == 7
    assert normalize_departure_hour(24) is None
    assert normalize_departure_hour(-1) is None
    assert normalize_departure_hour("x") is None


def test_traffic_weighted_detection():
    assert is_traffic_weighted(1.0, 1.0) is False
    assert is_traffic_weighted(1.35, 1.0) is True
    assert is_traffic_weighted(1.0, 1.30) is True
    assert is_traffic_weighted(1.0, 0.90) is True


# --- Grafo: pesos por escenario × banda -------------------------------------


def test_apply_scenario_weights_scales_with_band():
    graph = apply_scenario_weights(
        _two_corridor_graph(),
        traffic_multiplier=1.0,
        scenario_id="normal",
        band_factor=1.30,
    )
    direct = graph.get_edge_data(1, 2)[0]
    assert direct["weight"] == pytest.approx(100.0 * 1.30)
    assert direct["is_blocked"] is False


def test_default_band_preserves_legacy_weights():
    graph = apply_scenario_weights(
        _two_corridor_graph(),
        traffic_multiplier=1.35,
        scenario_id="peak_traffic",
        band_factor=1.0,
    )
    direct = graph.get_edge_data(1, 2)[0]
    # primary en pico: multiplicador al cuadrado (comportamiento previo intacto)
    assert direct["weight"] == pytest.approx(100.0 * 1.35 * 1.35)


# --- Ruteo por tiempo ponderado ---------------------------------------------


def test_by_time_routing_chooses_faster_corridor():
    graph = apply_scenario_weights(
        _two_corridor_graph(),
        traffic_multiplier=1.0,
        scenario_id="normal",
        band_factor=1.0,
    )
    dist_len, time_len = path_metrics_between_nodes(graph, 1, 2)
    assert dist_len == pytest.approx(1000.0)
    assert time_len == pytest.approx(100.0)

    dist_time, time_time = path_metrics_between_nodes(graph, 1, 2, by_time=True)
    assert dist_time == pytest.approx(2000.0)
    assert time_time == pytest.approx(90.0)


def test_by_time_scales_duration_with_band():
    graph = apply_scenario_weights(
        _two_corridor_graph(),
        traffic_multiplier=1.0,
        scenario_id="normal",
        band_factor=1.30,
    )
    dist_m, time_s = path_metrics_between_nodes(graph, 1, 2, by_time=True)
    # ruta alterna: 90 s × 1.30
    assert dist_m == pytest.approx(2000.0)
    assert time_s == pytest.approx(90.0 * 1.30)


def test_rain_blocks_primary_only_when_weighted():
    graph = apply_scenario_weights(
        _two_corridor_graph(),
        traffic_multiplier=1.2,
        scenario_id="rain",
        band_factor=1.0,
    )
    direct = graph.get_edge_data(1, 2)[0]
    assert direct["weight"] == float("inf")
    assert direct["is_blocked"] is True

    # Modo por longitud (legacy): no evita la vía bloqueada.
    _dist_len, time_len = path_metrics_between_nodes(graph, 1, 2)
    assert time_len == pytest.approx(100.0)

    # Modo ponderado: evita la primary y usa la residencial (2 × 45 × 1.2).
    dist_time, time_time = path_metrics_between_nodes(graph, 1, 2, by_time=True)
    assert dist_time == pytest.approx(2000.0)
    assert time_time == pytest.approx(108.0)


# --- Caché de matrices: separación por banda y modelo -----------------------


def test_cache_key_differs_by_band_and_time_model():
    base = build_matrix_cache_key(101, [1, 2], "normal", 1.0)
    banded = build_matrix_cache_key(
        101,
        [1, 2],
        "normal",
        1.0,
        traffic_band_factor=1.30,
        time_model="weighted",
    )
    weighted = build_matrix_cache_key(
        101,
        [1, 2],
        "normal",
        1.0,
        traffic_band_factor=1.0,
        time_model="weighted",
    )
    assert base != banded
    assert base != weighted
    assert banded != weighted


def test_incremental_parent_requires_same_band_and_model(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.distance_matrix_cache.settings.data_dir", str(tmp_path))
    parent_key = build_matrix_cache_key(
        101,
        [1, 2, 3],
        "normal",
        1.0,
        traffic_band_factor=1.30,
        time_model="weighted",
    )
    dist = [[0.0, 1.0, 2.0, 3.0], [1.0, 0.0, 4.0, 5.0], [2.0, 4.0, 0.0, 6.0], [3.0, 5.0, 6.0, 0.0]]
    time = [[0.0, 1.3, 2.6, 3.9], [1.3, 0.0, 5.2, 6.5], [2.6, 5.2, 0.0, 7.8], [3.9, 6.5, 7.8, 0.0]]
    save_distance_matrix_cache(
        parent_key,
        dist,
        time,
        depot_node=101,
        point_ids=[1, 2, 3],
        scenario_id="normal",
        traffic_multiplier=1.0,
        traffic_band_factor=1.30,
        time_model="weighted",
    )

    found = find_incremental_parent_cache(
        depot_node=101,
        point_ids=[2, 3],
        scenario_id="normal",
        traffic_multiplier=1.0,
        traffic_band_factor=1.30,
        time_model="weighted",
    )
    assert found is not None

    wrong_band = find_incremental_parent_cache(
        depot_node=101,
        point_ids=[2, 3],
        scenario_id="normal",
        traffic_multiplier=1.0,
        traffic_band_factor=1.0,
        time_model="weighted",
    )
    assert wrong_band is None

    legacy_model = find_incremental_parent_cache(
        depot_node=101,
        point_ids=[2, 3],
        scenario_id="normal",
        traffic_multiplier=1.0,
        traffic_band_factor=1.30,
        time_model="length",
    )
    assert legacy_model is None
