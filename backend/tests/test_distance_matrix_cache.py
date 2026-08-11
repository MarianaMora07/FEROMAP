"""Tests del cache de matrices de distancia."""

from __future__ import annotations

from app.services.distance_matrix_cache import (
    build_matrix_cache_key,
    build_matrix_from_parent,
    find_incremental_parent_cache,
    load_distance_matrix_cache,
    save_distance_matrix_cache,
)


class _Point:
    def __init__(self, point_id: int) -> None:
        self.point_id = point_id


def test_matrix_cache_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.distance_matrix_cache.settings.data_dir", str(tmp_path))

    key = build_matrix_cache_key(101, [3, 1, 2], "normal", 1.0)
    assert key == build_matrix_cache_key(101, [2, 3, 1], "normal", 1.0)
    assert key != build_matrix_cache_key(101, [2, 3, 1], "rain", 1.0)

    dist = [[0.0, 10.0, 20.0], [10.0, 0.0, 30.0], [20.0, 30.0, 0.0]]
    time = [[0.0, 5.0, 10.0], [5.0, 0.0, 15.0], [10.0, 15.0, 0.0]]
    assert load_distance_matrix_cache(key) is None

    save_distance_matrix_cache(
        key,
        dist,
        time,
        depot_node=101,
        point_ids=[1, 2],
        scenario_id="normal",
        traffic_multiplier=1.0,
    )
    loaded = load_distance_matrix_cache(key)
    assert loaded is not None
    assert loaded[0] == dist
    assert loaded[1] == time


def test_build_matrix_from_parent_extracts_submatrix(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.distance_matrix_cache.settings.data_dir", str(tmp_path))

    parent_key = build_matrix_cache_key(101, [1, 2, 3], "normal", 1.0)
    parent_dist = [
        [0.0, 10.0, 20.0, 30.0],
        [10.0, 0.0, 40.0, 50.0],
        [20.0, 40.0, 0.0, 60.0],
        [30.0, 50.0, 60.0, 0.0],
    ]
    parent_time = [[row / 2 for row in line] for line in parent_dist]
    save_distance_matrix_cache(
        parent_key,
        parent_dist,
        parent_time,
        depot_node=101,
        point_ids=[1, 2, 3],
        scenario_id="normal",
        traffic_multiplier=1.0,
    )

    customers = [_Point(2), _Point(3)]
    parent = find_incremental_parent_cache(
        depot_node=101,
        point_ids=[2, 3],
        scenario_id="normal",
        traffic_multiplier=1.0,
    )
    assert parent is not None

    def fail_pair(_i: int, _j: int) -> tuple[float, float]:
        raise AssertionError("no debería recalcular en extracción pura")

    dist, time, recomputed = build_matrix_from_parent(parent, customers, fail_pair)
    assert recomputed == 0
    assert dist[0][1] == 20.0
    assert dist[1][2] == 60.0
    assert time[0][2] == 15.0


def test_build_matrix_from_parent_patches_added_point(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.distance_matrix_cache.settings.data_dir", str(tmp_path))

    parent_key = build_matrix_cache_key(101, [1, 2], "normal", 1.0)
    parent_dist = [
        [0.0, 10.0, 20.0],
        [10.0, 0.0, 30.0],
        [20.0, 30.0, 0.0],
    ]
    parent_time = [[row / 2 for row in line] for line in parent_dist]
    save_distance_matrix_cache(
        parent_key,
        parent_dist,
        parent_time,
        depot_node=101,
        point_ids=[1, 2],
        scenario_id="normal",
        traffic_multiplier=1.0,
    )

    customers = [_Point(1), _Point(2), _Point(99)]
    parent = find_incremental_parent_cache(
        depot_node=101,
        point_ids=[1, 2, 99],
        scenario_id="normal",
        traffic_multiplier=1.0,
    )
    assert parent is not None

    calls: list[tuple[int, int]] = []

    def pair_fn(i: int, j: int) -> tuple[float, float]:
        calls.append((i, j))
        return 99.0, 9.0

    dist, _time, recomputed = build_matrix_from_parent(parent, customers, pair_fn)
    assert recomputed > 0
    assert dist[1][2] == 30.0
    assert any(call[0] == 3 or call[1] == 3 for call in calls)
