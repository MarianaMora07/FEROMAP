"""Tests del contrato vertedero + jornada (ADR-004, Fase 0)."""

import pytest

from app.domain.landfill_service_time import (
    DEFAULT_LANDFILL_UNLOAD_SECONDS,
    DEFAULT_SHIFT_BUDGET_SECONDS,
    build_landfill_route_breakdown,
    can_fit_stop_in_shift,
    landfill_node_index,
    landfill_unload_seconds,
    route_operational_elapsed_seconds,
    shift_budget_seconds,
    shift_utilization_pct,
)


def test_landfill_node_index():
    assert landfill_node_index(20) == 21


def test_landfill_unload_seconds_default():
    assert landfill_unload_seconds() == DEFAULT_LANDFILL_UNLOAD_SECONDS == 900


def test_shift_budget_default_jornada():
    assert shift_budget_seconds("06:00", "18:00") == DEFAULT_SHIFT_BUDGET_SECONDS == 43200


def test_shift_budget_rejects_invalid_window():
    with pytest.raises(ValueError):
        shift_budget_seconds("18:00", "06:00")


def test_route_operational_elapsed_includes_all_components():
    # viaje 7200 + 5×300 paradas + 2×900 vertedero = 7200+1500+1800 = 10500
    elapsed = route_operational_elapsed_seconds(
        travel_seconds=7200,
        collection_stop_count=5,
        service_seconds_per_stop=300,
        landfill_visit_count=2,
    )
    assert elapsed == 10500


def test_can_fit_stop_in_shift():
    budget = shift_budget_seconds()
    assert can_fit_stop_in_shift(40000, 1200, 300, budget) is True
    assert can_fit_stop_in_shift(43000, 500, 300, budget) is False


def test_shift_utilization_pct_caps_at_100():
    budget = shift_budget_seconds()
    assert shift_utilization_pct(budget * 0.5, budget) == 50.0
    assert shift_utilization_pct(budget * 2, budget) == 100.0


def test_breakdown_includes_landfill_and_shift():
    breakdown = build_landfill_route_breakdown(
        travel_seconds=7200,
        collection_stop_count=5,
        service_seconds_per_stop=300,
        landfill_visit_count=2,
    )
    data = breakdown.to_dict()
    assert data["landfillVisitCount"] == 2
    assert data["unloadSecondsTotal"] == 1800
    assert data["shiftBudgetSeconds"] == 43200
    assert data["elapsedSeconds"] == 10500
