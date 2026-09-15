"""Tests de la calibración de la tasa con pesos recolectados (EWMA)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.domain.calibration import (
    ewma,
    estimate_rate_kg_per_hour,
    rate_samples_kg_per_hour,
)


def _t(hours: float) -> datetime:
    base = datetime(2026, 9, 1, 6, 0, tzinfo=timezone.utc)
    return base + timedelta(hours=hours)


def test_rate_samples_from_consecutive_collections():
    events = [(_t(0), 100.0), (_t(10), 200.0), (_t(20), 100.0)]

    assert rate_samples_kg_per_hour(events) == pytest.approx([20.0, 10.0])


def test_rate_samples_ignores_non_positive_intervals_and_weights():
    events = [(_t(0), 100.0), (_t(0), 50.0), (_t(5), 0.0), (_t(10), 50.0)]

    assert rate_samples_kg_per_hour(events) == pytest.approx([10.0])


def test_estimate_rate_uses_ewma():
    events = [(_t(0), 100.0), (_t(10), 200.0), (_t(20), 100.0)]

    rate, samples = estimate_rate_kg_per_hour(events, alpha=0.5)

    assert samples == 2
    # EWMA con alpha 0.5: 20 → 0.5·10 + 0.5·20 = 15.
    assert rate == pytest.approx(15.0)


def test_estimate_rate_needs_two_events():
    assert estimate_rate_kg_per_hour([(_t(0), 100.0)]) == (None, 0)
    assert estimate_rate_kg_per_hour([]) == (None, 0)


def test_ewma_first_value_is_seed():
    assert ewma([7.0], alpha=0.3) == pytest.approx(7.0)
    assert ewma([]) is None
