"""Tests del modelo de generación temporal de residuos (Tarea 3)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.domain.waste_generation import (
    DEFAULT_FILL_HOURS,
    critical_day_offset,
    effective_fill_hours,
    effective_fill_rate_factor,
    estimated_fill_hours,
    fill_events_cycle_daily_values,
    generation_rate_kg_per_hour,
    hours_until_critical,
    projected_fill_level_kg,
    projected_fill_level_pct,
)


def _point(*, fill_kg: float = 0.0, capacity: float = 1000.0, hours=None, last_emptied=None):
    return type(
        "Point",
        (),
        {
            "max_capacity_kg": capacity,
            "current_fill_level_kg": fill_kg,
            "estimated_fill_hours": hours,
            "last_emptied_at": last_emptied,
        },
    )()


def _now() -> datetime:
    return datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)


# --- Tasa y estimación -------------------------------------------------------


def test_estimated_fill_hours_defaults_when_missing():
    assert estimated_fill_hours(_point()) == DEFAULT_FILL_HOURS
    assert estimated_fill_hours(_point(hours=0)) == DEFAULT_FILL_HOURS


def test_generation_rate_is_capacity_over_hours():
    rate = generation_rate_kg_per_hour(_point(capacity=1000.0, hours=100.0))
    assert rate == pytest.approx(10.0)
    assert generation_rate_kg_per_hour(_point(capacity=0)) == 0.0


# --- Factor de velocidad de llenado (zona / contenedor) ----------------------


def test_effective_fill_rate_factor_defaults_to_1():
    point = _point(capacity=1000.0, hours=100.0)
    assert effective_fill_rate_factor(point) == 1.0
    assert effective_fill_hours(point) == pytest.approx(100.0)


def test_sector_factor_speeds_up_generation():
    point = _point(capacity=1000.0, hours=100.0)
    point.sector = SimpleNamespace(fill_rate_factor=1.5)

    assert effective_fill_rate_factor(point) == pytest.approx(1.5)
    assert effective_fill_hours(point) == pytest.approx(100.0 / 1.5)
    assert generation_rate_kg_per_hour(point) == pytest.approx(15.0)


def test_container_override_wins_over_sector():
    point = _point(capacity=1000.0, hours=100.0)
    point.sector = SimpleNamespace(fill_rate_factor=1.5)
    point.fill_rate_factor_override = 2.0

    assert effective_fill_rate_factor(point) == pytest.approx(2.0)
    assert effective_fill_hours(point) == pytest.approx(50.0)
    assert generation_rate_kg_per_hour(point) == pytest.approx(20.0)


def test_invalid_factors_fall_back_to_default():
    point = _point(capacity=1000.0, hours=100.0)
    point.sector = SimpleNamespace(fill_rate_factor=0)
    point.fill_rate_factor_override = 0

    assert effective_fill_rate_factor(point) == 1.0
    assert generation_rate_kg_per_hour(point) == pytest.approx(10.0)


def test_factor_shortens_hours_until_critical():
    baseline = _point(fill_kg=600.0, capacity=1000.0, hours=100.0)
    faster = _point(fill_kg=600.0, capacity=1000.0, hours=100.0)
    faster.sector = SimpleNamespace(fill_rate_factor=2.0)

    # 80 % = 800 kg; faltan 200 kg. A 10 kg/h → 20 h; a 20 kg/h → 10 h.
    assert hours_until_critical(baseline, at=_now()) == pytest.approx(20.0)
    assert hours_until_critical(faster, at=_now()) == pytest.approx(10.0)


# --- Proyección --------------------------------------------------------------


def test_projection_stays_static_when_never_emptied():
    point = _point(fill_kg=620.0, hours=72.0, last_emptied=None)
    assert float(projected_fill_level_kg(point, at=_now())) == pytest.approx(620.0)
    assert projected_fill_level_pct(point, at=_now()) == 62


def test_projection_grows_from_last_empty():
    point = _point(capacity=1000.0, hours=72.0, last_emptied=_now() - timedelta(hours=24))
    fill = float(projected_fill_level_kg(point, at=_now()))
    assert fill == pytest.approx(1000.0 / 72.0 * 24.0, abs=0.01)
    assert projected_fill_level_pct(point, at=_now()) == 33


def test_projection_clamps_at_capacity():
    point = _point(capacity=1000.0, hours=48.0, last_emptied=_now() - timedelta(hours=200))
    assert float(projected_fill_level_kg(point, at=_now())) == pytest.approx(1000.0)
    assert projected_fill_level_pct(point, at=_now()) == 100


# --- Umbral crítico ----------------------------------------------------------


def test_hours_until_critical_from_seeded_fill():
    point = _point(fill_kg=600.0, capacity=1000.0, hours=100.0, last_emptied=None)
    # Umbral 80% = 800 kg; faltan 200 kg a 10 kg/h.
    assert hours_until_critical(point, at=_now()) == pytest.approx(20.0)
    assert critical_day_offset(point, days=7, at=_now()) == 0


def test_hours_until_critical_zero_when_already_critical():
    point = _point(fill_kg=900.0, capacity=1000.0, hours=100.0, last_emptied=None)
    assert hours_until_critical(point, at=_now()) == 0.0


def test_hours_until_critical_from_last_empty():
    point = _point(capacity=1000.0, hours=100.0, last_emptied=_now() - timedelta(hours=50))
    # 500 kg actuales → faltan 300 kg a 10 kg/h = 30 h → día 1.
    assert hours_until_critical(point, at=_now()) == pytest.approx(30.0)
    assert critical_day_offset(point, days=7, at=_now()) == 1


# --- Ciclo de historial (sube → recoge → sube) -------------------------------


def test_fill_cycle_series_shows_spikes_and_recovery():
    now = _now()
    point = _point(capacity=1000.0, hours=48.0)
    events = [
        (datetime(2026, 9, 2, 8, 0, tzinfo=timezone.utc), 500.0),
        (datetime(2026, 9, 3, 8, 0, tzinfo=timezone.utc), 500.0),
    ]
    values = fill_events_cycle_daily_values(point, events, days=3, now=now)
    # Días con recolección: pico de 50%; día sin recolección: crece desde el último vaciado.
    assert values[0] == pytest.approx(50.0)
    assert values[1] == pytest.approx(50.0)
    # 09-04 sin evento: desde el 03/08 08:00 hasta el 05/09 00:00 → 40 h × (1000/48).
    assert values[2] == pytest.approx(40 * 1000 / 48 / 1000 * 100)


def test_fill_cycle_requires_at_least_two_collection_days():
    now = _now()
    point = _point(capacity=1000.0, hours=48.0)
    events = [(datetime(2026, 9, 3, 8, 0, tzinfo=timezone.utc), 500.0)]
    assert fill_events_cycle_daily_values(point, events, days=3, now=now) == []
