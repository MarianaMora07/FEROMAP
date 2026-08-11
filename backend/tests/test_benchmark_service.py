"""Tests del benchmark ACO (Fase D)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.services import benchmark_service


def test_benchmark_profiles_and_scenarios_count():
    assert len(benchmark_service.BENCHMARK_SCENARIOS) == 5
    assert len(benchmark_service.ACO_BENCHMARK_PROFILES) == 3


def test_save_and_load_aco_benchmark(tmp_path, monkeypatch):
    cache_dir = tmp_path / "benchmarks"
    cache_dir.mkdir()
    path = cache_dir / "aco_latest.json"
    monkeypatch.setattr(benchmark_service, "benchmark_cache_path", lambda: path)

    payload = {
        "generatedAt": "2026-08-10T12:00:00+00:00",
        "durationSeconds": 1.0,
        "scenarioCount": 5,
        "profileCount": 3,
        "runs": [],
    }
    benchmark_service.save_aco_benchmark(payload)
    loaded = benchmark_service.load_aco_benchmark()

    assert loaded is not None
    assert loaded["scenarioCount"] == 5
    assert json.loads(path.read_text(encoding="utf-8"))["profileCount"] == 3


def test_run_aco_benchmark_aggregates_runs(monkeypatch, tmp_path):
    db = MagicMock()

    def fake_run(db_, scenario_id, **kwargs):
        assert kwargs.get("auto_commit") is False
        return {
            "kpis": {
                "distanceKm": {"current": 28.4, "optimized": 20.1},
                "engineMetrics": {
                    "computationSeconds": 8.0,
                    "graphLoadSeconds": 3.0,
                    "acoSeconds": 2.0,
                    "overheadSeconds": 3.0,
                    "acoIterationsRun": 10,
                    "acoStoppedEarly": True,
                    "matrixCacheHit": True,
                    "matrixCacheIncremental": False,
                },
            }
        }

    saved: dict = {}

    monkeypatch.setattr(benchmark_service, "run_optimization_engine", fake_run)
    monkeypatch.setattr(
        benchmark_service,
        "save_aco_benchmark",
        lambda payload: saved.update(payload) or tmp_path / "aco_latest.json",
    )

    result = benchmark_service.run_aco_benchmark(db)

    assert result["scenarioCount"] == 5
    assert result["profileCount"] == 3
    assert len(result["runs"]) == 15
    assert all(run.get("savingPct") is not None for run in result["runs"] if "error" not in run)
    assert db.rollback.call_count == 15
    assert saved["runs"][0]["profileId"] == "fast"
