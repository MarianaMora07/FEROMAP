"""Tests de la comparativa Fase 0 (`just phase0-baseline`).

Cubre: los 5 escenarios en orden canónico, la columna de cobertura crítica y el cómputo
medido en caché caliente (con calentamiento descartado por escenario).
"""

from __future__ import annotations

from unittest.mock import MagicMock

from app.domain.scenarios import SCENARIO_LABELS, SCENARIO_ORDER
from scripts import phase0_baseline_metrics as phase0


def _kpis() -> dict:
    return {
        "kpis": {
            "distanceKm": {"current": 100.0, "optimized": 60.0},
            "durationHours": {"current": 10.0, "optimized": 9.0},
            "uncoveredPoints": 0,
            "uncoveredPointCodes": [],
            "co2KgAvoided": 12.0,
            "fuelLiters": {"current": 30.0, "optimized": 18.0},
            "coveragePct": {"current": 100, "optimized": 100},
            "criticalCoveragePct": {"current": 100, "optimized": 100},
            "containersServed": 20,
            "landfillTrips": 3,
            "engineMetrics": {
                "computationSeconds": 5.0,
                "graphLoadSeconds": 0.1,
                "acoSeconds": 4.0,
                "overheadSeconds": 0.9,
            },
        }
    }


def test_phase0_scenarios_follow_the_canonical_order():
    assert phase0.PHASE0_SCENARIOS == SCENARIO_ORDER
    assert len(phase0.PHASE0_SCENARIOS) == 5
    assert set(SCENARIO_ORDER) <= set(SCENARIO_LABELS)


def test_run_phase0_baseline_reports_five_scenarios_and_cache_state(monkeypatch):
    calls: list[str] = []

    def fake_run(db_, scenario_id, **kwargs):
        assert kwargs.get("auto_commit") is False
        calls.append(scenario_id)
        return _kpis()

    monkeypatch.setattr(phase0, "run_optimization_engine", fake_run)
    monkeypatch.setattr(phase0, "warm_road_graph_cache", lambda: {"source": "test"})
    monkeypatch.setattr(phase0, "SessionLocal", lambda: MagicMock())

    payload = phase0.run_phase0_baseline()

    assert payload["scenarioIds"] == list(SCENARIO_ORDER)
    assert payload["cacheState"] == "warm"
    assert len(payload["runs"]) == 5
    # Una corrida descartada (calentamiento) + la registrada por escenario.
    assert calls == [scenario for scenario in SCENARIO_ORDER for _ in range(2)]

    for run in payload["runs"]:
        assert run["criticalCoveragePct"]["optimized"] == 100
        assert run["computationSeconds"] == 5.0
        assert run["acoSeconds"] == 4.0
        assert run["savingPct"] == 40.0
