"""Cache en disco de matrices de distancia/tiempo del motor VRP."""

from __future__ import annotations

import hashlib
import json
import logging
import math
from pathlib import Path
from typing import Any, Callable, Protocol

from app.config import settings

logger = logging.getLogger(__name__)

MatrixPairFn = Callable[[int, int], tuple[float, float]]


class MatrixCustomer(Protocol):
    point_id: int


def _cache_dir() -> Path:
    path = Path(settings.data_dir) / "cache" / "matrices"
    try:
        path.mkdir(parents=True, exist_ok=True)
        return path
    except OSError:
        fallback = Path("/tmp/feromap-cache") / "matrices"
        fallback.mkdir(parents=True, exist_ok=True)
        logger.warning("Cache de matrices en %s no escribible; usando %s", path, fallback)
        return fallback


def build_matrix_cache_key(
    depot_node: int,
    point_ids: list[int],
    scenario_id: str,
    traffic_multiplier: float,
    *,
    landfill_lon: float | None = None,
    landfill_lat: float | None = None,
) -> str:
    payload: dict[str, Any] = {
        "depotNode": depot_node,
        "pointIds": sorted(point_ids),
        "scenarioId": scenario_id,
        "trafficMultiplier": round(float(traffic_multiplier), 4),
    }
    if landfill_lon is not None and landfill_lat is not None:
        payload["includesLandfill"] = True
        payload["landfillLon"] = round(float(landfill_lon), 6)
        payload["landfillLat"] = round(float(landfill_lat), 6)
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"),
    ).hexdigest()
    return digest


def _cache_path(cache_key: str) -> Path:
    return _cache_dir() / f"{cache_key}.json"


def _validate_matrix_payload(payload: dict[str, Any]) -> bool:
    dist = payload.get("distance")
    time = payload.get("time")
    point_ids = payload.get("pointIds")
    if not isinstance(dist, list) or not isinstance(time, list) or not isinstance(point_ids, list):
        return False
    includes_landfill = bool(payload.get("includesLandfill"))
    expected = (2 + len(point_ids)) if includes_landfill else (1 + len(point_ids))
    return len(dist) == expected and len(time) == expected and all(len(row) == expected for row in dist)


def load_distance_matrix_cache_entry(cache_key: str) -> dict[str, Any] | None:
    path = _cache_path(cache_key)
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as fh:
            payload: dict[str, Any] = json.load(fh)
        if not _validate_matrix_payload(payload):
            raise ValueError("payload inválido")
        return payload
    except Exception as exc:
        logger.warning("Cache de matriz corrupto (%s): %s", path, exc)
        return None


def load_distance_matrix_cache(
    cache_key: str,
) -> tuple[list[list[float]], list[list[float]]] | None:
    payload = load_distance_matrix_cache_entry(cache_key)
    if payload is None:
        return None
    logger.info("Matriz de costos cargada desde cache %s", _cache_path(cache_key))
    return payload["distance"], payload["time"]


def save_distance_matrix_cache(
    cache_key: str,
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    *,
    depot_node: int,
    point_ids: list[int],
    scenario_id: str,
    traffic_multiplier: float,
    landfill_lon: float | None = None,
    landfill_lat: float | None = None,
) -> None:
    path = _cache_path(cache_key)
    payload: dict[str, Any] = {
        "depotNode": depot_node,
        "pointIds": point_ids,
        "scenarioId": scenario_id,
        "trafficMultiplier": round(float(traffic_multiplier), 4),
        "distance": dist_matrix,
        "time": time_matrix,
    }
    if landfill_lon is not None and landfill_lat is not None:
        payload["includesLandfill"] = True
        payload["landfillLon"] = round(float(landfill_lon), 6)
        payload["landfillLat"] = round(float(landfill_lat), 6)
    try:
        with path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, separators=(",", ":"))
        logger.info("Matriz de costos cacheada en %s", path)
    except OSError as exc:
        logger.warning("No se pudo escribir cache de matriz: %s", exc)


def _list_matrix_cache_entries() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for path in _cache_dir().glob("*.json"):
        try:
            with path.open(encoding="utf-8") as fh:
                payload: dict[str, Any] = json.load(fh)
            if _validate_matrix_payload(payload):
                payload["_cacheKey"] = path.stem
                entries.append(payload)
        except Exception:
            continue
    return entries


def _parent_index_map(point_ids: list[int]) -> dict[int, int]:
    return {0: 0, **{point_id: index + 1 for index, point_id in enumerate(point_ids)}}


def _matrix_point_id_at(index: int, point_ids: list[int]) -> int:
    if index == 0:
        return 0
    return point_ids[index - 1]


def build_matrix_from_parent(
    parent: dict[str, Any],
    customers: list[MatrixCustomer],
    pair_fn: MatrixPairFn,
) -> tuple[list[list[float]], list[list[float]], int]:
    """Reutiliza celdas del padre y recalcula solo pares afectados por altas."""
    parent_point_ids: list[int] = parent["pointIds"]
    parent_dist: list[list[float]] = parent["distance"]
    parent_time: list[list[float]] = parent["time"]
    parent_index = _parent_index_map(parent_point_ids)
    includes_landfill = bool(parent.get("includesLandfill"))

    current_point_ids = [customer.point_id for customer in customers]
    current_set = set(current_point_ids)
    parent_set = set(parent_point_ids)
    added = current_set - parent_set

    if not current_set.issubset(parent_set) and len(added) > settings.matrix_incremental_max_additions:
        raise ValueError("demasiados puntos nuevos para parche incremental")

    n = (2 + len(customers)) if includes_landfill else (1 + len(customers))
    dist = [[0.0] * n for _ in range(n)]
    time = [[0.0] * n for _ in range(n)]
    recomputed = 0

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if includes_landfill and (i == n - 1 or j == n - 1):
                d_m, t_s = pair_fn(i, j)
                dist[i][j] = d_m
                time[i][j] = t_s
                recomputed += 1
                continue
            pi = _matrix_point_id_at(i, current_point_ids)
            pj = _matrix_point_id_at(j, current_point_ids)
            if (
                pi in parent_index
                and pj in parent_index
                and pi not in added
                and pj not in added
            ):
                old_i = parent_index[pi]
                old_j = parent_index[pj]
                dist[i][j] = parent_dist[old_i][old_j]
                time[i][j] = parent_time[old_i][old_j]
            else:
                d_m, t_s = pair_fn(i, j)
                dist[i][j] = d_m
                time[i][j] = t_s
                recomputed += 1

    return dist, time, recomputed


def find_incremental_parent_cache(
    *,
    depot_node: int,
    point_ids: list[int],
    scenario_id: str,
    traffic_multiplier: float,
    landfill_lon: float | None = None,
    landfill_lat: float | None = None,
) -> dict[str, Any] | None:
    """Busca una matriz padre reutilizable (submatriz o parche incremental)."""
    current_set = set(point_ids)
    traffic = round(float(traffic_multiplier), 4)
    includes_landfill = landfill_lon is not None and landfill_lat is not None
    best: dict[str, Any] | None = None
    best_score = float("inf")

    for entry in _list_matrix_cache_entries():
        if entry.get("depotNode") != depot_node:
            continue
        if entry.get("scenarioId") != scenario_id:
            continue
        if round(float(entry.get("trafficMultiplier", 0)), 4) != traffic:
            continue
        if bool(entry.get("includesLandfill")) != includes_landfill:
            continue
        if includes_landfill:
            if round(float(entry.get("landfillLon", 0)), 6) != round(float(landfill_lon), 6):
                continue
            if round(float(entry.get("landfillLat", 0)), 6) != round(float(landfill_lat), 6):
                continue

        parent_ids: list[int] = entry["pointIds"]
        parent_set = set(parent_ids)
        added = current_set - parent_set
        removed = parent_set - current_set

        if current_set.issubset(parent_set):
            score = len(removed)
        elif len(added) <= settings.matrix_incremental_max_additions:
            score = len(added) + len(removed)
        else:
            continue

        if score < best_score:
            best_score = score
            best = entry

    return best


def sanitize_distance_matrix(
    dist_matrix: list[list[float]],
    time_matrix: list[list[float]],
    pair_fn: MatrixPairFn,
) -> int:
    """Reemplaza distancias no finitas (p. ej. Infinity del grafo o caché legacy)."""
    patched = 0
    n = len(dist_matrix)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            d_m = dist_matrix[i][j]
            if math.isfinite(d_m) and d_m > 0:
                continue
            d_m, t_s = pair_fn(i, j)
            if not math.isfinite(d_m) or d_m <= 0:
                d_m = 1.0
            if not math.isfinite(t_s) or t_s <= 0:
                t_s = 1.0
            dist_matrix[i][j] = d_m
            time_matrix[i][j] = t_s
            patched += 1
    return patched


def _finalize_matrix(
    dist: list[list[float]],
    time: list[list[float]],
    pair_fn: MatrixPairFn,
    meta: dict[str, Any],
) -> tuple[list[list[float]], list[list[float]], dict[str, Any]]:
    sanitized = sanitize_distance_matrix(dist, time, pair_fn)
    if sanitized > 0:
        meta = {**meta, "matrixSanitizedCells": sanitized}
    return dist, time, meta


def resolve_distance_matrix(
    *,
    depot_node: int,
    customers: list[MatrixCustomer],
    scenario_id: str,
    traffic_multiplier: float,
    build_full_matrix: Callable[[], tuple[list[list[float]], list[list[float]]]],
    pair_fn: MatrixPairFn,
    landfill_lon: float | None = None,
    landfill_lat: float | None = None,
) -> tuple[list[list[float]], list[list[float]], dict[str, Any]]:
    point_ids = [customer.point_id for customer in customers]
    cache_key = build_matrix_cache_key(
        depot_node,
        point_ids,
        scenario_id,
        traffic_multiplier,
        landfill_lon=landfill_lon,
        landfill_lat=landfill_lat,
    )

    exact = load_distance_matrix_cache_entry(cache_key)
    if exact is not None:
        return _finalize_matrix(
            exact["distance"],
            exact["time"],
            pair_fn,
            {
                "matrixCacheHit": True,
                "matrixCacheIncremental": False,
                "matrixPatchedCells": 0,
                "matrixParentPointCount": len(point_ids),
            },
        )

    parent = find_incremental_parent_cache(
        depot_node=depot_node,
        point_ids=point_ids,
        scenario_id=scenario_id,
        traffic_multiplier=traffic_multiplier,
        landfill_lon=landfill_lon,
        landfill_lat=landfill_lat,
    )
    if parent is not None:
        dist, time, recomputed = build_matrix_from_parent(parent, customers, pair_fn)
        save_distance_matrix_cache(
            cache_key,
            dist,
            time,
            depot_node=depot_node,
            point_ids=point_ids,
            scenario_id=scenario_id,
            traffic_multiplier=traffic_multiplier,
            landfill_lon=landfill_lon,
            landfill_lat=landfill_lat,
        )
        parent_count = len(parent["pointIds"])
        incremental = parent_count != len(point_ids) or recomputed > 0
        return _finalize_matrix(
            dist,
            time,
            pair_fn,
            {
                "matrixCacheHit": False,
                "matrixCacheIncremental": incremental,
                "matrixPatchedCells": recomputed,
                "matrixParentPointCount": parent_count,
            },
        )

    dist, time = build_full_matrix()
    save_distance_matrix_cache(
        cache_key,
        dist,
        time,
        depot_node=depot_node,
        point_ids=point_ids,
        scenario_id=scenario_id,
        traffic_multiplier=traffic_multiplier,
        landfill_lon=landfill_lon,
        landfill_lat=landfill_lat,
    )
    return _finalize_matrix(
        dist,
        time,
        pair_fn,
        {
            "matrixCacheHit": False,
            "matrixCacheIncremental": False,
            "matrixPatchedCells": 0,
            "matrixParentPointCount": 0,
        },
    )
