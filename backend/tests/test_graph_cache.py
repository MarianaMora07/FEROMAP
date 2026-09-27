"""Tests del cache del grafo OSMnx."""

from __future__ import annotations

import networkx as nx

from app.services import graph_service


def _tiny_graph() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph()
    graph.add_node(1, x=-62.715, y=8.295)
    graph.add_node(2, x=-62.710, y=8.300)
    graph.add_edge(1, 2, 0, length=1000.0, travel_time=120.0, highway="residential")
    return graph


def test_load_road_graph_reuses_memory_without_disk(tmp_path, monkeypatch):
    monkeypatch.setattr(graph_service, "_graph_cache", {})
    monkeypatch.setattr(graph_service.settings, "data_dir", str(tmp_path))
    graph_service._graph_cache["graph"] = _tiny_graph()

    first = graph_service.load_road_graph()
    second = graph_service.load_road_graph()

    assert first is second
    assert graph_service.graph_load_source() == "memory"


def test_warm_road_graph_cache_writes_pickle_and_meta(tmp_path, monkeypatch):
    monkeypatch.setattr(graph_service, "_graph_cache", {})
    monkeypatch.setattr(graph_service.settings, "data_dir", str(tmp_path))

    graphml = tmp_path / "grafos" / "unare_mapa.graphml"
    graphml.parent.mkdir(parents=True)
    graphml.write_text("<graphml></graphml>", encoding="utf-8")

    tiny = _tiny_graph()

    def fake_load_graphml(_path):
        return tiny.copy()

    monkeypatch.setattr(graph_service.ox, "load_graphml", fake_load_graphml)
    monkeypatch.setattr(graph_service.ox, "add_edge_speeds", lambda g: g)
    monkeypatch.setattr(graph_service.ox, "add_edge_travel_times", lambda g: g)
    monkeypatch.setattr(graph_service, "_extend_graph_coverage", lambda g: g)

    meta = graph_service.warm_road_graph_cache(force_reload=True)

    assert meta["source"] == "graphml"
    assert (tmp_path / "cache" / "unare_graph.pkl").exists()
    assert (tmp_path / "cache" / "unare_graph.meta.json").exists()

    graph_service._graph_cache.clear()
    loaded = graph_service.load_road_graph()
    assert graph_service.graph_load_source() == "disk"
    assert loaded.number_of_nodes() == 2
