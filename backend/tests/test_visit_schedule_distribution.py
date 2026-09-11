"""Tests del reseeding coherente de frecuencias (Fase 5)."""

from __future__ import annotations

from types import SimpleNamespace

from app.domain.visit_schedule_distribution import (
    UNDER_SERVED_EVERY,
    baseline_fill_hours,
    declared_visits_for_code,
    planned_visits_and_weekdays,
    point_fill_rate_override,
    required_visits_for_code,
    sector_fill_rate_factor,
    weekdays_for_visits,
)


def test_baseline_fill_hours_range():
    hours = [baseline_fill_hours(f"CNT-{index:03d}") for index in range(1, 121)]
    assert min(hours) == 72
    assert max(hours) == 119


def test_required_visits_match_hours():
    assert required_visits_for_code("CNT-048") == 3  # 72 h → ceil(168 / 72)
    assert required_visits_for_code("CNT-001") == 3  # 79 h → ceil(2.13)


def test_declared_is_coherent_except_under_served():
    under_served = 0
    for index in range(1, 121):
        code = f"CNT-{index:03d}"
        required = required_visits_for_code(code)
        declared = declared_visits_for_code(code)
        if index % UNDER_SERVED_EVERY == 0 and required > 1:
            under_served += 1
            assert declared == required - 1
        else:
            assert declared == required
    assert under_served > 0


def test_weekdays_match_declared_count():
    for index in range(1, 121):
        code = f"CNT-{index:03d}"
        declared = declared_visits_for_code(code)
        weekdays = weekdays_for_visits(code, declared)
        assert len(set(weekdays)) == min(5, declared)
        assert all(0 <= day <= 4 for day in weekdays)


def test_zones_and_overrides_are_deterministic():
    assert sector_fill_rate_factor("Unare I") == 1.40
    assert sector_fill_rate_factor("Sector Desconocido") == 1.0
    assert point_fill_rate_override("CNT-001") == 1.5
    assert point_fill_rate_override("CNT-004") is None


def _point(code: str, *, hours: float) -> SimpleNamespace:
    return SimpleNamespace(
        code=code,
        estimated_fill_hours=hours,
        max_capacity_kg=1000.0,
        current_fill_level_kg=0.0,
        last_emptied_at=None,
        sector=None,
        status="active",
    )


def test_planned_visits_uses_point_physics():
    declared, weekdays = planned_visits_and_weekdays(_point("CNT-004", hours=72.0))
    # Sin sector → factor 1 → 72 h → 3 requeridas; serial 4 no bajo-servido.
    assert declared == 3
    assert len(weekdays) == 3


def test_planned_visits_under_served_example():
    declared, _ = planned_visits_and_weekdays(_point("CNT-009", hours=87.0))
    # 87 h → 2 requeridas; serial 9 → bajo-servido a 1 a propósito.
    assert declared == 1
