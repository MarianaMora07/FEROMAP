"""Tests Fase 3 de planificación operativa."""

from datetime import date
from decimal import Decimal

from app.services.planning_service import compute_pending_priority


def test_compute_pending_priority_reason_weight():
    breakdown = compute_pending_priority(date.today(), reason="skipped_breakdown")
    normal = compute_pending_priority(date.today(), reason="not_visited")
    assert breakdown > normal


def test_compute_pending_priority_fill_level():
    class Point:
        priority_boost = False
        current_fill_level_kg = Decimal("900")
        max_capacity_kg = Decimal("1000")

    critical = compute_pending_priority(date.today(), Point())  # type: ignore[arg-type]
    baseline = compute_pending_priority(date.today())
    assert critical > baseline
