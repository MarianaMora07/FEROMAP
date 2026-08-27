"""Tests del estudio de sensibilidad ACO (Fase 3)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.services import aco_sensitivity_service


def test_sensitivity_series_count():
    assert len(aco_sensitivity_service.ANT_SENSITIVITY_SERIES) == 3
    assert len(aco_sensitivity_service.ITERATION_SENSITIVITY_SERIES) == 3


def test_save_and_load_aco_sensitivity(tmp_path, monkeypatch):
    cache_dir = tmp_path / "phase3"
    cache_dir.mkdir()
    path = cache_dir / "aco_sensitivity.json"
    monkeypatch.setattr(aco_sensitivity_service, "sensitivity_cache_path", lambda: path)

    payload = {
        "generatedAt": "2026-08-27T12:00:00+00:00",
        "durationSeconds": 42.0,
        "scenarioId": "normal",
        "runs": [],
    }
    aco_sensitivity_service.save_aco_sensitivity(payload)
    loaded = aco_sensitivity_service.load_aco_sensitivity()

    assert loaded is not None
    assert loaded["scenarioId"] == "normal"
    assert json.loads(path.read_text(encoding="utf-8"))["durationSeconds"] == 42.0


def test_run_aco_sensitivity_aggregates_runs(monkeypatch, tmp_path):
    db = MagicMock()

    def fake_run(db_, scenario_id, **kwargs):
        assert kwargs.get("auto_commit") is False
        ants = kwargs.get("aco_ants", 12)
        iters = kwargs.get("aco_iterations", 20)
        optimized = 22.0 - (ants / 100) - (iters / 200)
        return {
            "kpis": {
                "distanceKm": {"current": 28.4, "optimized": optimized},
                "uncoveredPoints": 0,
                "engineMetrics": {
                    "computationSeconds": ants * 0.4 + iters * 0.2,
                    "acoSeconds": 2.0,
                    "acoIterationsRun": iters,
                    "acoStoppedEarly": False,
                },
            }
        }

    saved: dict = {}

    monkeypatch.setattr(aco_sensitivity_service, "run_optimization_engine", fake_run)
    monkeypatch.setattr(
        aco_sensitivity_service,
        "save_aco_sensitivity",
        lambda payload: saved.update(payload) or tmp_path / "aco_sensitivity.json",
    )

    result = aco_sensitivity_service.run_aco_sensitivity(db)

    assert result["scenarioId"] == "normal"
    assert len(result["runs"]) == 6
    assert result["standardProfile"] == {"acoAnts": 12, "acoIterations": 20}
    assert all(run.get("distanceKmOptimized") is not None for run in result["runs"] if "error" not in run)
    assert db.rollback.call_count == 6
    assert saved["runs"][0]["axis"] == "ants"
