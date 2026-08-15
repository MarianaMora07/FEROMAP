"""Geometría vial de rutas optimizadas para capas GeoJSON del mapa operativo."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Sequence

from app.domain.landfill_service_time import DEFAULT_LANDFILL_LAT, DEFAULT_LANDFILL_LON
from app.services.graph_service import (
    DEPOT_LAT,
    DEPOT_LON,
    build_tour_coordinates,
    load_road_graph,
    nearest_node,
    nearest_node_in_component,
    weakly_connected_component_nodes,
)

logger = logging.getLogger(__name__)

_ROUTE_GEOMETRY_CACHE: dict[tuple[Any, ...], list[list[float]]] = {}
_ROUTE_GEOMETRY_CACHE_MAX = 512


def clear_route_geometry_cache() -> None:
    _ROUTE_GEOMETRY_CACHE.clear()


def _waypoint_lon_lat(waypoint: Any) -> tuple[float, float] | None:
    waypoint_type = getattr(waypoint, "waypoint_type", None) or "collection"
    if waypoint_type == "landfill":
        # Constantes de contrato: landfill_lat ≈ lon geográfico, landfill_lon ≈ lat.
        return DEFAULT_LANDFILL_LAT, DEFAULT_LANDFILL_LON
    point = getattr(waypoint, "collection_point", None)
    if point is None:
        return None
    try:
        lng = float(point.longitude)
        lat = float(point.latitude)
    except (AttributeError, TypeError, ValueError):
        return None
    if not (-180.0 <= lng <= 180.0 and -90.0 <= lat <= 90.0):
        return None
    return lng, lat


def _straight_line_coords(
    waypoint_coords: Sequence[tuple[float, float]],
    *,
    include_depot: bool,
) -> list[list[float]]:
    coords: list[list[float]] = []
    if include_depot:
        coords.append([DEPOT_LON, DEPOT_LAT])
    coords.extend([[lng, lat] for lng, lat in waypoint_coords])
    if include_depot and waypoint_coords:
        coords.append([DEPOT_LON, DEPOT_LAT])
    return coords


def _road_line_coords(
    waypoint_coords: Sequence[tuple[float, float]],
    *,
    include_depot: bool,
) -> list[list[float]] | None:
    if len(waypoint_coords) < 1:
        return None

    graph = load_road_graph()
    if graph is None:
        return None

    # Anclar al componente del primer contenedor: el depósito puede caer en otra
    # "isla" del GraphML y eso genera diagonales que cruzan el mapa.
    seed_node = nearest_node(graph, waypoint_coords[0][0], waypoint_coords[0][1])
    component = weakly_connected_component_nodes(graph, seed_node)

    node_seq: list[int] = []
    if include_depot:
        node_seq.append(
            nearest_node_in_component(graph, DEPOT_LON, DEPOT_LAT, component)
        )

    for lng, lat in waypoint_coords:
        node_seq.append(nearest_node_in_component(graph, lng, lat, component))

    if include_depot:
        node_seq.append(
            nearest_node_in_component(graph, DEPOT_LON, DEPOT_LAT, component)
        )

    if len(node_seq) < 2:
        return None

    road_coords = build_tour_coordinates(graph, node_seq)
    if len(road_coords) >= 4:
        return road_coords
    if len(road_coords) >= 2:
        return road_coords
    return None


def snap_lonlat_sequence(
    coordinates: Sequence[Sequence[float]],
    *,
    include_depot: bool = False,
) -> list[list[float]]:
    """Ajusta una secuencia [lng, lat] al grafo vial OSMnx; fallback a la secuencia original."""
    waypoint_coords = [
        (float(pair[0]), float(pair[1]))
        for pair in coordinates
        if len(pair) >= 2
    ]
    if len(waypoint_coords) < 1:
        return []

    try:
        road_coords = _road_line_coords(waypoint_coords, include_depot=include_depot)
        if road_coords:
            return road_coords
    except Exception as exc:
        logger.debug("Snap de coordenadas no disponible, usando secuencia original: %s", exc)

    return _straight_line_coords(waypoint_coords, include_depot=include_depot)


def build_route_linestring(
    waypoints: Sequence[Any],
    *,
    include_depot: bool = True,
) -> list[list[float]]:
    """Devuelve coordenadas [lng, lat] siguiendo el grafo vial; fallback a línea recta."""
    ordered = sorted(waypoints, key=lambda wp: getattr(wp, "sequence_order", 0))
    waypoint_coords = [
        coord for wp in ordered if (coord := _waypoint_lon_lat(wp)) is not None
    ]

    if len(waypoint_coords) < 2 and not include_depot:
        return _straight_line_coords(waypoint_coords, include_depot=include_depot)

    try:
        road_coords = _road_line_coords(waypoint_coords, include_depot=include_depot)
        if road_coords:
            return road_coords
    except Exception as exc:
        logger.debug("Geometría vial no disponible, usando línea recta: %s", exc)

    return _straight_line_coords(waypoint_coords, include_depot=include_depot)


def _route_cache_key(route: Any, waypoints: Sequence[Any], *, include_depot: bool) -> tuple[Any, ...]:
    ordered = sorted(waypoints, key=lambda wp: getattr(wp, "sequence_order", 0))
    coords_key: list[tuple[Any, ...]] = []
    for wp in ordered:
        waypoint_type = getattr(wp, "waypoint_type", None) or "collection"
        coord = _waypoint_lon_lat(wp)
        if coord is not None:
            coords_key.append((waypoint_type, coord))
    updated_at = getattr(route, "updated_at", None)
    if isinstance(updated_at, datetime):
        updated_key = updated_at.isoformat()
    else:
        updated_key = str(updated_at or "")
    return (
        int(getattr(route, "id", 0)),
        updated_key,
        getattr(route, "status", ""),
        tuple(coords_key),
        include_depot,
    )


def build_route_linestring_cached(
    route: Any,
    waypoints: Sequence[Any],
    *,
    include_depot: bool = True,
) -> list[list[float]]:
    """Memoiza geometría por route_id + updated_at + paradas."""
    key = _route_cache_key(route, waypoints, include_depot=include_depot)
    cached = _ROUTE_GEOMETRY_CACHE.get(key)
    if cached is not None:
        return cached

    coords = build_route_linestring(waypoints, include_depot=include_depot)
    if len(_ROUTE_GEOMETRY_CACHE) >= _ROUTE_GEOMETRY_CACHE_MAX:
        _ROUTE_GEOMETRY_CACHE.clear()
    _ROUTE_GEOMETRY_CACHE[key] = coords
    return coords
