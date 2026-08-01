"""Carga y cache del grafo vial OSMnx para la parroquia Unare."""

from __future__ import annotations

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

# Bbox aproximado del área de estudio (lon_min, lat_min, lon_max, lat_max)
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
    """Carga el grafo desde GraphML con cache en data/cache/."""
    if not force_reload and "graph" in _graph_cache:
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
                logger.info("Grafo cargado desde cache %s", pkl)
                return graph
            except Exception:
                logger.warning("Cache de grafo corrupto; recargando desde GraphML")

    if graphml.exists():
        logger.info("Cargando grafo desde %s", graphml)
        graph = ox.load_graphml(graphml)
    else:
        logger.info("GraphML no encontrado; descargando OSMnx bbox Unare")
        graph = ox.graph_from_bbox(
            bbox=UNARE_BBOX,
            network_type="drive",
            simplify=True,
        )
        graphml.parent.mkdir(parents=True, exist_ok=True)
        ox.save_graphml(graph, graphml)

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


@lru_cache(maxsize=512)
def shortest_path_cost(graph_id: int, orig: int, dest: int) -> tuple[float, float]:
    """Retorna (distancia_metros, tiempo_segundos) entre dos nodos."""
    graph = _graph_cache["graph"]
    try:
        path = nx.shortest_path(graph, orig, dest, weight="weight")
    except nx.NetworkXNoPath:
        return float("inf"), float("inf")

    dist_m = 0.0
    time_s = 0.0
    for u, v in zip(path[:-1], path[1:]):
        edge = min(graph[u][v].values(), key=lambda d: d.get("weight", float("inf")))
        dist_m += float(edge.get("length", 0))
        time_s += float(edge.get("travel_time", edge.get("weight", 0)))
    return dist_m, time_s


def route_path_coordinates(graph: nx.MultiDiGraph, path_nodes: list[int]) -> list[list[float]]:
    """Convierte secuencia de nodos en coordenadas [lon, lat] siguiendo geometría vial."""
    coords: list[list[float]] = []
    for u, v in zip(path_nodes[:-1], path_nodes[1:]):
        edge_data = graph.get_edge_data(u, v)
        if not edge_data:
            continue
        edge = min(edge_data.values(), key=lambda d: d.get("weight", float("inf")))
        if edge.get("geometry") is not None:
            line_coords = list(edge["geometry"].coords)
            if coords and line_coords and line_coords[0] == tuple(coords[-1]):
                line_coords = line_coords[1:]
            coords.extend([list(c) for c in line_coords])
        else:
            coords.append([graph.nodes[u]["x"], graph.nodes[u]["y"]])
    if path_nodes:
        last = path_nodes[-1]
        last_pt = [graph.nodes[last]["x"], graph.nodes[last]["y"]]
        if not coords or coords[-1] != last_pt:
            coords.append(last_pt)
    return coords


def shortest_path_nodes(graph: nx.MultiDiGraph, orig: int, dest: int) -> list[int]:
    if orig == dest:
        return [orig]
    try:
        return nx.shortest_path(graph, orig, dest, weight="weight")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return [orig, dest]


def _edge_metrics(graph: nx.MultiDiGraph, u: int, v: int) -> tuple[float, float]:
    edge_data = graph.get_edge_data(u, v)
    if not edge_data:
        return 0.0, 0.0
    edge = min(edge_data.values(), key=lambda d: d.get("weight", float("inf")))
    return float(edge.get("length", 0)), float(edge.get("travel_time", edge.get("weight", 0)))


def build_tour_coordinates(graph: nx.MultiDiGraph, node_sequence: list[int]) -> list[list[float]]:
    """Une coordenadas de segmentos entre nodos consecutivos de una ruta."""
    all_coords: list[list[float]] = []
    for orig, dest in zip(node_sequence[:-1], node_sequence[1:]):
        segment_nodes = shortest_path_nodes(graph, orig, dest)
        segment_coords = route_path_coordinates(graph, segment_nodes)
        if all_coords and segment_coords and segment_coords[0] == all_coords[-1]:
            segment_coords = segment_coords[1:]
        all_coords.extend(segment_coords)
    return all_coords


def clear_path_cache() -> None:
    shortest_path_cost.cache_clear()
