"""Tests del estudio de sensibilidad ACO (Fase 3)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import aco_sensitivity_service
from app.services.sweep_progress import SWEEP_SENSITIVITY


def test_sensitivity_series_count():
    assert len(aco_sensitivity_service.ANT_SENSITIVITY_SERIES) == 3
    assert len(aco_sensitivity_service.ITERATION_SENSITIVITY_SERIES) == 3
    assert len(aco_sensitivity_service.HYPERPARAMETER_SENSITIVITY_SERIES) == 12


def test_load_aco_sensitivity_reads_the_latest_run(monkeypatch):
    payload = {"generatedAt": "2026-08-27T12:00:00+00:00", "scenarioId": "normal", "runs": []}
    captured: dict = {}

    def fake_latest(db, *, sweep):
        captured["sweep"] = sweep
        return payload

    monkeypatch.setattr(aco_sensitivity_service, "latest_payload", fake_latest)

    assert aco_sensitivity_service.load_aco_sensitivity(MagicMock()) is payload
    assert captured["sweep"] == SWEEP_SENSITIVITY


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
        "record_sweep",
        lambda db, *, sweep, payload, instance_fingerprint=None: saved.update(payload),
    )

    result = aco_sensitivity_service.run_aco_sensitivity(db)

    num_series = len(
        [
            *aco_sensitivity_service.ANT_SENSITIVITY_SERIES,
            *aco_sensitivity_service.ITERATION_SENSITIVITY_SERIES,
            *aco_sensitivity_service.HYPERPARAMETER_SENSITIVITY_SERIES,
        ]
    )
    assert result["scenarioId"] == "normal"
    assert len(result["runs"]) == num_series
    assert result["standardProfile"] == {"acoAnts": 12, "acoIterations": 20}
    assert result["standardHyperparameters"]["acoAlpha"] == 1.0
    assert all(run.get("distanceKmOptimized") is not None for run in result["runs"] if "error" not in run)
    assert db.rollback.call_count == num_series
    assert saved["runs"][0]["axis"] == "ants"
    hyper_runs = [run for run in result["runs"] if run["axis"] in {"alpha", "beta", "rho", "q"}]
    assert len(hyper_runs) == len(aco_sensitivity_service.HYPERPARAMETER_SENSITIVITY_SERIES)
