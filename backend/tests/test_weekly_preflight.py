"""Tests de pre-flight semanal por día (Tarea 9)."""

from __future__ import annotations

from app.services.planning_service import evaluate_day_load


def test_day_load_feasible_when_demand_within_fleet():
    result = evaluate_day_load(demand_kg=20000.0, capacity_kg=30000.0, expected_vehicles=3, available_vehicles=4)
    assert result["overloaded"] is False
    assert result["insufficientFleet"] is False


def test_day_load_detects_overcapacity():
    result = evaluate_day_load(demand_kg=30000.0, capacity_kg=29000.0, expected_vehicles=3, available_vehicles=3)
    assert result["overloaded"] is True


def test_day_load_detects_insufficient_fleet():
    result = evaluate_day_load(demand_kg=10000.0, capacity_kg=30000.0, expected_vehicles=5, available_vehicles=2)
    assert result["overloaded"] is False
    assert result["insufficientFleet"] is True


def test_empty_day_is_feasible():
    result = evaluate_day_load(demand_kg=0.0, capacity_kg=0.0, expected_vehicles=2, available_vehicles=2)
    assert result["overloaded"] is False


def test_aggregate_weekly_results_sums_km_and_hours():
    from app.services.planning_service import _aggregate_weekly_day_results

    rows = [
        {"distanceKm": 40.0, "durationHours": 8.0, "feasible": True},
        {"distanceKm": 60.0, "durationHours": 9.5, "feasible": True},
        {"skipped": True},
    ]
    aggregate = _aggregate_weekly_day_results(rows)
    assert aggregate["kpis"]["distanceKm"]["optimized"] == 100.0
    assert aggregate["kpis"]["durationHours"]["optimized"] == 17.5
    assert aggregate["feasible"] is True


def test_aggregate_weekly_results_marks_infeasible_on_error_or_uncovered():
    from app.services.planning_service import _aggregate_weekly_day_results

    rows = [
        {"distanceKm": 40.0, "durationHours": 8.0, "feasible": True},
        {"distanceKm": 10.0, "durationHours": 2.0, "feasible": False},
    ]
    assert _aggregate_weekly_day_results(rows)["feasible"] is False

    rows_failed = [{"distanceKm": 40.0, "durationHours": 8.0, "feasible": True}, {"error": "boom"}]
    assert _aggregate_weekly_day_results(rows_failed)["feasible"] is False
