"""Regresión: KPIs agregados de planificación toleran contratos numéricos y {current, optimized}."""

from __future__ import annotations

from app.services.planning_analytics_service import _numeric_kpi


def test_numeric_kpi_accepts_scalars_and_contracts():
    assert _numeric_kpi(12.5) == 12.5
    assert _numeric_kpi({"current": 30, "optimized": 20}) == 20
    assert _numeric_kpi({"current": 5}) == 5


def test_numeric_kpi_defaults_to_zero():
    assert _numeric_kpi(None) == 0.0
    assert _numeric_kpi("no-numero") == 0.0
    assert _numeric_kpi({}) == 0.0
