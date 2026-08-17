"""Carga y cache del grafo vial OSMnx para la parroquia Unare."""

from __future__ import annotations

import json
import logging
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Any

import networkx as nx
import osmnx as ox

from app.config import settings

logger = logging.getLogger(__name__)

# Centro operativo (depósito) — Parroquia Unare
DEPOT_LON = -62.715
DEPOT_LAT = 8.295

# Bbox que cubre los 20 contenedores del demo (seeds)
COLLECTION_POINTS_BBOX = (-62.738, 8.272, -62.695, 8.302)

# Bbox aproximado del área de estudio (lon_min, lat_min, lon_max, lat_max).
# Debe coincidir con UNARE_BBOX en src/core/types/geo.ts (frontend).
UNARE_BBOX = (-62.81, 8.24, -62.69, 8.31)


def _graph_bbox(graph: nx.MultiDiGraph) -> tuple[float, float, float, float]:
    xs = [float(d["x"]) for _, d in graph.nodes(data=True)]
    ys = [float(d["y"]) for _, d in graph.nodes(data=True)]
    return min(xs), min(ys), max(xs), max(ys)


def _merge_graphs(base: nx.MultiDiGraph, extra: nx.MultiDiGraph) -> nx.MultiDiGraph:
    merged = base.copy()
    merged.update(extra)
    return merged


def _extend_graph_coverage(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    """Añade tramo OSMnx oriental si el GraphML no cubre los contenedores del demo."""
    _, _, max_lon, max_lat = _graph_bbox(graph)
    target_min_lon, target_min_lat, target_max_lon, target_max_lat = COLLECTION_POINTS_BBOX

    if max_lon >= target_max_lon - 0.005 and max_lat >= target_max_lat - 0.005:
        return graph

    east_bbox = (target_min_lon, target_min_lat, target_max_lon, target_max_lat)
    logger.info("Extendiendo grafo OSMnx (franja oriental) %s", east_bbox)
    try:
        extension = ox.graph_from_bbox(
            bbox=east_bbox,
            network_type="drive",
            simplify=True,
        )
        extension = ox.add_edge_speeds(extension)
        extension = ox.add_edge_travel_times(extension)
        return _merge_graphs(graph, extension)
    except Exception as exc:
        logger.warning("No se pudo extender grafo OSMnx: %s", exc)
        return graph

BLOCKED_HIGHWAY_TYPES = frozenset({"motorway", "trunk", "primary"})
PEAK_PENALTY_HIGHWAYS = frozenset({"primary", "trunk", "motorway"})

_graph_cache: dict[str, Any] = {}
_last_graph_load_source: str = "unknown"


def graph_load_source() -> str:
    return _last_graph_load_source


def warm_road_graph_cache(*, force_reload: bool = False) -> dict[str, Any]:
    """Pre-calienta el pickle del grafo OSMnx (seed/deploy). Evita descarga en la 1.ª optimización."""
    graph = load_road_graph(force_reload=force_reload)
    meta = {
        "source": _last_graph_load_source,
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "picklePath": str(_pickle_path()),
        "graphmlPath": str(_graphml_path()),
    }
    meta_path = _cache_dir() / "unare_graph.meta.json"
    try:
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("No se pudo escribir metadata del grafo: %s", exc)
    return meta


def _cache_dir() -> Path:
    path = Path(settings.data_dir) / "cache"
    try:
        path.mkdir(parents=True, exist_ok=True)
        return path
    except OSError:
        fallback = Path("/tmp/feromap-cache")
        fallback.mkdir(parents=True, exist_ok=True)
        logger.warning("Cache en %s no escribible; usando %s", path, fallback)
        return fallback


def _graphml_path() -> Path:
    return Path(settings.data_dir) / "grafos" / "unare_mapa.graphml"


def _pickle_path() -> Path:
    return _cache_dir() / "unare_graph.pkl"


def load_road_graph(*, force_reload: bool = False) -> nx.MultiDiGraph:
    """Carga el grafo desde GraphML con cache en memoria y data/cache/."""
    global _last_graph_load_source

    if not force_reload and "graph" in _graph_cache:
        _last_graph_load_source = "memory"
        return _graph_cache["graph"]

    graphml = _graphml_path()
    pkl = _pickle_path()

    if not force_reload and pkl.exists():
        graphml_mtime = graphml.stat().st_mtime if graphml.exists() else 0
        if pkl.stat().st_mtime >= graphml_mtime:
            try:
                with pkl.open("rb") as fh:
                    graph = pickle.load(fh)
                _graph_cache["graph"] = graph
                _last_graph_load_source = "disk"
                logger.info("Grafo cargado desde cache %s", pkl)
                return graph
            except Exception:
                logger.warning("Cache de grafo corrupto; recargando desde GraphML")

    if graphml.exists():
        logger.info("Cargando grafo desde %s", graphml)
        graph = ox.load_graphml(graphml)
        _last_graph_load_source = "graphml"
    else:
        logger.info("GraphML no encontrado; descargando OSMnx bbox Unare")
        graph = ox.graph_from_bbox(
            bbox=UNARE_BBOX,
            network_type="drive",
            simplify=True,
        )
        graphml.parent.mkdir(parents=True, exist_ok=True)
        ox.save_graphml(graph, graphml)
        _last_graph_load_source = "osmnx"

    graph = ox.add_edge_speeds(graph)
    graph = ox.add_edge_travel_times(graph)
    graph = _extend_graph_coverage(graph)

    try:
        with pkl.open("wb") as fh:
            pickle.dump(graph, fh, pickle.HIGHEST_PROTOCOL)
        logger.info("Grafo cacheado en %s", pkl)
    except OSError as exc:
        logger.warning("No se pudo escribir cache de grafo: %s", exc)

    _graph_cache["graph"] = graph
    return graph


def apply_scenario_weights(
    graph: nx.MultiDiGraph,
    *,
    traffic_multiplier: float = 1.0,
    scenario_id: str = "normal",
) -> nx.MultiDiGraph:
    """Aplica multiplicadores de tráfico y bloqueos por escenario."""
    blocked = scenario_id == "rain"
    peak = scenario_id == "peak_traffic"

    for _u, _v, _k, data in graph.edges(keys=True, data=True):
        hw = data.get("highway", "")
        if isinstance(hw, list):
            hw = hw[0] if hw else ""

        if blocked and hw in BLOCKED_HIGHWAY_TYPES:
            data["weight"] = float("inf")
            data["is_blocked"] = True
            continue

        base_tt = float(data.get("travel_time", data.get("length", 1.0) / 1000 * 60))
        mult = traffic_multiplier
        if peak and hw in PEAK_PENALTY_HIGHWAYS:
            mult *= traffic_multiplier

        data["weight"] = base_tt * mult
        data["is_blocked"] = False

    return graph


def nearest_node(graph: nx.MultiDiGraph, lon: float, lat: float) -> int:
    return ox.distance.nearest_nodes(graph, lon, lat)


def weakly_connected_component_nodes(graph: nx.MultiDiGraph, node: int) -> set[int]:
    for component in nx.weakly_connected_components(graph):
        if node in component:
            return set(component)
    return {node}


def nearest_node_in_component(
    graph: nx.MultiDiGraph,
    lon: float,
    lat: float,
    component: set[int],
) -> int:
    """Nodo más cercano restringido a un componente conexo (evita saltos entre islas del grafo)."""
    if not component:
        return nearest_node(graph, lon, lat)
    if len(component) == graph.number_of_nodes():
        return nearest_node(graph, lon, lat)
    subgraph = graph.subgraph(component)
    return ox.distance.nearest_nodes(subgraph, lon, lat)


def shortest_path_nodes_by_length(graph: nx.MultiDiGraph, orig: int, dest: int) -> list[int]:
    """Camino mínimo por distancia (length en metros), no por tiempo ponderado."""
    if orig == dest:
        return [orig]
    try:
        return nx.shortest_path(graph, orig, dest, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        pass
    try:
        undirected = graph.to_undirected()
        return nx.shortest_path(undirected, orig, dest, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound, nx.NetworkXError):
        logger.debug("Sin camino vial (length) entre nodos %s → %s", orig, dest)
        return [orig]


def path_metrics_between_nodes(
    graph: nx.MultiDiGraph,
    orig: int,
    dest: int,
) -> tuple[float, float]:
    """Distancia (m) y tiempo (s) por camino mínimo en el grafo vial."""
    path = shortest_path_nodes_by_length(graph, orig, dest)
    if len(path) < 2 or path == [orig]:
        if orig == dest:
            return 0.0, 0.0
        return float("inf"), float("inf")

    dist_m = 0.0
    time_s = 0.0
    for u, v in zip(path[:-1], path[1:]):
        edge_data = graph.get_edge_data(u, v) or graph.get_edge_data(v, u)
        if not edge_data:
            continue
        edge = min(edge_data.values(), key=lambda d: d.get("weight", float("inf")))
        dist_m += float(edge.get("length", 0))
        time_s += float(edge.get("travel_time", edge.get("weight", 0)))
    return dist_m, time_s


@lru_cache(maxsize=512)
def shortest_path_cost(graph_id: int, orig: int, dest: int) -> tuple[float, float]:
    """Retorna (distancia_metros, tiempo_segundos) entre dos nodos."""
    graph = _graph_cache["graph"]
    return path_metrics_between_nodes(graph, orig, dest)


def _edge_geometry_coords(
    graph: nx.MultiDiGraph,
    u: int,
    v: int,
) -> list[list[float]] | None:
    """Geometría de arista u→v; si solo existe v→u (sentido contrario), la invierte."""
    forward = graph.get_edge_data(u, v)
    if forward:
        edge = min(forward.values(), key=lambda d: d.get("weight", float("inf")))
        if edge.get("geometry") is not None:
            return [list(c) for c in edge["geometry"].coords]
        return [[graph.nodes[u]["x"], graph.nodes[u]["y"]], [graph.nodes[v]["x"], graph.nodes[v]["y"]]]

    reverse = graph.get_edge_data(v, u)
    if reverse:
        edge = min(reverse.values(), key=lambda d: d.get("weight", float("inf")))
        if edge.get("geometry") is not None:
            return [list(c) for c in reversed(list(edge["geometry"].coords))]
        return [[graph.nodes[u]["x"], graph.nodes[u]["y"]], [graph.nodes[v]["x"], graph.nodes[v]["y"]]]
    return None


def route_path_coordinates(graph: nx.MultiDiGraph, path_nodes: list[int]) -> list[list[float]]:
    """Convierte secuencia de nodos en coordenadas [lon, lat] siguiendo geometría vial."""
    coords: list[list[float]] = []
    for u, v in zip(path_nodes[:-1], path_nodes[1:]):
        line_coords = _edge_geometry_coords(graph, u, v)
        if not line_coords:
            continue
        if coords and line_coords and line_coords[0] == coords[-1]:
            line_coords = line_coords[1:]
        coords.extend(line_coords)
    if path_nodes and not coords:
        first = path_nodes[0]
        coords.append([graph.nodes[first]["x"], graph.nodes[first]["y"]])
    if path_nodes:
        last = path_nodes[-1]
        last_pt = [graph.nodes[last]["x"], graph.nodes[last]["y"]]
        if not coords or coords[-1] != last_pt:
            # Solo cierra al último nodo si ya hay tramo vial; evita saltos rectos huérfanos.
            if coords:
                coords.append(last_pt)
    return coords


def shortest_path_nodes(graph: nx.MultiDiGraph, orig: int, dest: int) -> list[int]:
    """Camino mínimo dirigido; si no hay, undirected. Nunca inventa un salto [orig, dest]."""
    if orig == dest:
        return [orig]
    try:
        return nx.shortest_path(graph, orig, dest, weight="weight")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        pass
    try:
        undirected = graph.to_undirected()
        return nx.shortest_path(undirected, orig, dest, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound, nx.NetworkXError):
        logger.debug("Sin camino vial entre nodos %s → %s", orig, dest)
        return [orig]


def _edge_metrics(graph: nx.MultiDiGraph, u: int, v: int) -> tuple[float, float]:
    edge_data = graph.get_edge_data(u, v) or graph.get_edge_data(v, u)
    if not edge_data:
        return 0.0, 0.0
    edge = min(edge_data.values(), key=lambda d: d.get("weight", float("inf")))
    return float(edge.get("length", 0)), float(edge.get("travel_time", edge.get("weight", 0)))


def build_tour_coordinates(graph: nx.MultiDiGraph, node_sequence: list[int]) -> list[list[float]]:
    """Une coordenadas de segmentos entre nodos consecutivos de una ruta."""
    all_coords: list[list[float]] = []
    for orig, dest in zip(node_sequence[:-1], node_sequence[1:]):
        if orig == dest:
            continue
        segment_nodes = shortest_path_nodes(graph, orig, dest)
        if len(segment_nodes) < 2:
            continue
        segment_coords = route_path_coordinates(graph, segment_nodes)
        if len(segment_coords) < 2:
            continue
        if all_coords and segment_coords and segment_coords[0] == all_coords[-1]:
            segment_coords = segment_coords[1:]
        all_coords.extend(segment_coords)
    return all_coords


def clear_path_cache() -> None:
    shortest_path_cost.cache_clear()
