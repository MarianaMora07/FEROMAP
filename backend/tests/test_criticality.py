"""Tests de la fuente única de verdad de criticidad (Fase 1).

Ver ``docs/fase-0/adr-criticidad.md`` (ADR-002).
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.domain.criticality import (
    CRITICAL_FILL_PCT,
    HIGH_FILL_PCT,
    CriticalityLevel,
    evaluate_criticality,
    fill_status_from_level,
    is_overloaded,
    normalize_critical_threshold,
    required_visits_per_week,
)
from app.domain.waste_generation import DEFAULT_FILL_HOURS, hours_until_critical
from app.services import admin_service


def _point(
    *,
    fill_kg: float = 0.0,
    capacity: float = 1000.0,
    hours: float | None = 100.0,
    last_emptied=None,
    status: str = "active",
):
    return SimpleNamespace(
        max_capacity_kg=capacity,
        current_fill_level_kg=fill_kg,
        estimated_fill_hours=hours,
        last_emptied_at=last_emptied,
        status=status,
    )


def _now() -> datetime:
    return datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)


# --- Umbrales y status --------------------------------------------------------


def test_thresholds_are_80_and_60():
    assert CRITICAL_FILL_PCT == 80.0
    assert HIGH_FILL_PCT == 60.0


def test_fill_status_from_level_aligns_critical_to_80():
    assert fill_status_from_level(80) == "critico"
    assert fill_status_from_level(79) == "lleno"
    assert fill_status_from_level(60) == "lleno"
    assert fill_status_from_level(59) == "normal"
    assert fill_status_from_level(30) == "normal"
    assert fill_status_from_level(29) == "parcial"
    assert fill_status_from_level(0) == "parcial"


def test_fill_status_from_level_out_of_service_wins():
    assert fill_status_from_level(95, point_status="inactive") == "fueraDeServicio"
    assert fill_status_from_level(0, point_status="maintenance") == "fueraDeServicio"


def test_fill_status_from_level_accepts_custom_threshold():
    # El umbral inyectado desplaza la frontera del nivel crítico.
    assert fill_status_from_level(85, critical_pct=90) == "lleno"
    assert fill_status_from_level(90, critical_pct=90) == "critico"


# --- normalize_critical_threshold --------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (80, 80.0),
        (90, 90.0),
        ("75", 75.0),
        (None, CRITICAL_FILL_PCT),
        (150, CRITICAL_FILL_PCT),
        (-5, CRITICAL_FILL_PCT),
        ("abc", CRITICAL_FILL_PCT),
    ],
)
def test_normalize_critical_threshold(value, expected):
    assert normalize_critical_threshold(value) == expected


# --- evaluate_criticality -----------------------------------------------------


def test_evaluate_criticality_exact_threshold_is_critical():
    point = _point(fill_kg=800.0, capacity=1000.0)
    result = evaluate_criticality(point, at=_now())

    assert result.is_critical is True
    assert result.level is CriticalityLevel.CRITICAL
    assert result.status == "critico"
    assert result.fill_pct == 80


def test_evaluate_criticality_below_threshold_is_full():
    result = evaluate_criticality(_point(fill_kg=750.0, capacity=1000.0), at=_now())

    assert result.is_critical is False
    assert result.level is CriticalityLevel.FULL
    assert result.fill_pct == 75


def test_evaluate_criticality_out_of_service():
    result = evaluate_criticality(_point(fill_kg=950.0, status="inactive"), at=_now())

    assert result.is_critical is False
    assert result.level is CriticalityLevel.OUT_OF_SERVICE


def test_evaluate_criticality_never_emptied_uses_seeded_fill():
    point = _point(fill_kg=850.0, capacity=1000.0, last_emptied=None)
    result = evaluate_criticality(point, at=_now())

    assert result.fill_pct == 85
    assert result.is_critical is True
    # Ya superó el umbral: no quedan horas hasta crítico.
    assert result.hours_until_critical == 0.0


def test_evaluate_criticality_zero_capacity_is_safe():
    result = evaluate_criticality(_point(fill_kg=0.0, capacity=0.0), at=_now())

    assert result.fill_pct == 0
    assert result.is_critical is False
    assert result.hours_until_critical is None


def test_estimated_fill_hours_zero_falls_back_and_stays_positive():
    # hours <= 0 usa DEFAULT_FILL_HOURS; el pipeline no debe romperse.
    result = evaluate_criticality(_point(fill_kg=600.0, capacity=1000.0, hours=0.0), at=_now())

    assert DEFAULT_FILL_HOURS == 72.0
    assert result.is_critical is False
    assert result.hours_until_critical is not None


def test_evaluate_criticality_respects_custom_threshold():
    point = _point(fill_kg=850.0, capacity=1000.0, hours=100.0)
    # Con umbral 90 %, 85 % todavía no es crítico.
    result = evaluate_criticality(point, at=_now(), threshold=90)

    assert result.is_critical is False
    assert result.fill_pct == 85


# --- hours_until_critical con umbral -----------------------------------------


def test_hours_until_critical_honors_threshold_pct():
    point = _point(fill_kg=600.0, capacity=1000.0, hours=100.0)

    # 80 % = 800 kg; faltan 200 kg a 10 kg/h → 20 h.
    assert hours_until_critical(point, at=_now()) == pytest.approx(20.0)
    # 90 % = 900 kg; faltan 300 kg → 30 h.
    assert hours_until_critical(point, at=_now(), threshold_pct=90) == pytest.approx(30.0)


# --- Frecuencia requerida (híbrida) -------------------------------------------


def test_required_visits_72h_is_three():
    assert required_visits_per_week(_point(hours=72.0)) == 3


def test_required_visits_factor_two_over_144h_is_three():
    point = _point(hours=144.0)
    point.sector = SimpleNamespace(fill_rate_factor=2.0)
    # 144 / 2 = 72 h → ceil(168 / 72) = 3.
    assert required_visits_per_week(point) == 3


def test_required_visits_clamp_slow_and_fast():
    assert required_visits_per_week(_point(hours=168.0)) == 1
    assert required_visits_per_week(_point(hours=40.0)) == 5
    assert required_visits_per_week(_point(hours=24.0)) == 7


def test_required_visits_override_wins_over_sector():
    point = _point(hours=168.0)
    point.sector = SimpleNamespace(fill_rate_factor=2.0)
    point.fill_rate_factor_override = 4.0
    # 168 / 4 = 42 h → ceil(168 / 42) = 4.
    assert required_visits_per_week(point) == 4


def test_is_overloaded_only_when_declared_below_required():
    assert is_overloaded(3, 2) is True
    assert is_overloaded(3, 3) is False
    assert is_overloaded(3, 4) is False
    assert is_overloaded(3, None) is False


# --- admin_service.resolve_critical_threshold (cache) ------------------------


def test_resolve_critical_threshold_reads_and_caches(monkeypatch):
    calls = {"count": 0}

    def _fake_settings(_db):
        calls["count"] += 1
        return SimpleNamespace(fill_threshold_pct=90)

    monkeypatch.setattr(admin_service, "get_operational_settings", _fake_settings)
    admin_service.invalidate_critical_threshold_cache()

    assert admin_service.resolve_critical_threshold(object()) == 90.0
    assert admin_service.resolve_critical_threshold(object()) == 90.0
    assert calls["count"] == 1  # segunda llamada usa cache

    admin_service.invalidate_critical_threshold_cache()
    assert admin_service.resolve_critical_threshold(object()) == 90.0
    assert calls["count"] == 2


def test_resolve_critical_threshold_falls_back_on_invalid_value(monkeypatch):
    monkeypatch.setattr(
        admin_service,
        "get_operational_settings",
        lambda _db: SimpleNamespace(fill_threshold_pct=150),
    )
    admin_service.invalidate_critical_threshold_cache()

    assert admin_service.resolve_critical_threshold(object()) == CRITICAL_FILL_PCT
    admin_service.invalidate_critical_threshold_cache()
