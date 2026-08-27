"""Tests de restricciones operativas Fase 4."""

from __future__ import annotations

from app.services.route_constraints import (
    AFTERNOON_WINDOW,
    MORNING_WINDOW,
    build_customer_time_windows,
    build_fill_level_heuristic_matrix,
    fill_level_distance_factor,
    is_visit_feasible_with_window,
    sector_time_window_secs,
)


def test_fill_level_distance_factor_prioritizes_critical():
    assert fill_level_distance_factor(85) < fill_level_distance_factor(70) < fill_level_distance_factor(40)


def test_sector_time_window_alternates_morning_afternoon():
    assert sector_time_window_secs(2) == MORNING_WINDOW
    assert sector_time_window_secs(3) == AFTERNOON_WINDOW


def test_heuristic_matrix_reduces_cost_to_critical_nodes():
    dist = [
        [0, 100, 100],
        [100, 0, 100],
        [100, 100, 0],
    ]
    heuristic = build_fill_level_heuristic_matrix(dist, [50, 90], enabled=True)
    assert heuristic[0][2] < dist[0][2]
    assert heuristic[0][1] == dist[0][1]


def test_heuristic_matrix_disabled_is_unchanged():
    dist = [[0, 100], [100, 0]]
    assert build_fill_level_heuristic_matrix(dist, [95], enabled=False) == dist


def test_build_customer_time_windows_when_enabled():
    starts, ends = build_customer_time_windows([2, 3], enabled=True)
    assert starts == [float(MORNING_WINDOW[0]), float(AFTERNOON_WINDOW[0])]
    assert ends == [float(MORNING_WINDOW[1]), float(AFTERNOON_WINDOW[1])]


def test_visit_feasible_within_window():
    time_matrix = [[0, 600], [600, 0]]
    assert is_visit_feasible_with_window(
        0,
        0,
        1,
        300,
        time_matrix,
        window_start=0,
        window_end=3600,
        shift_budget_sec=43200,
    )


def test_visit_infeasible_after_window_end():
    time_matrix = [[0, 5000], [5000, 0]]
    assert not is_visit_feasible_with_window(
        0,
        0,
        1,
        300,
        time_matrix,
        window_start=0,
        window_end=3600,
        shift_budget_sec=43200,
    )
