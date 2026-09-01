"""Tests del reporte de caso de estudio en modo planificación."""

from __future__ import annotations

from app.services.case_study_planning_report import (
    PLANNING_MODE_THRESHOLD,
    should_use_planning_report,
    split_point_ids_across_workdays,
)


def test_should_use_planning_report_threshold():
    assert should_use_planning_report(PLANNING_MODE_THRESHOLD) is False
    assert should_use_planning_report(PLANNING_MODE_THRESHOLD + 1) is True


def test_split_point_ids_round_robin_five_days():
    point_ids = list(range(1, 81))
    buckets = split_point_ids_across_workdays(point_ids)
    assert len(buckets) == 5
    assert sum(len(bucket) for bucket in buckets) == 80
    assert all(len(bucket) == 16 for bucket in buckets)
    assert buckets[0] == [1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56, 61, 66, 71, 76]


def test_split_point_ids_preserves_sorted_order_within_day():
    buckets = split_point_ids_across_workdays([30, 10, 20])
    assert buckets[0] == [10]
    assert buckets[1] == [20]
    assert buckets[2] == [30]
