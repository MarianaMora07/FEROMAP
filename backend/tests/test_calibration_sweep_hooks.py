"""Hooks de progreso y cancelación de los barridos de calibración (Fase 13 · Fase 1).

Cubre el contrato de ``sweep_progress``: ``on_run`` se invoca antes de cada corrida
con índices crecientes y ``cancel_check`` corta entre corridas sin escribir la caché.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import aco_sensitivity_service, multiobjective_sweep_service
from app.services.sweep_progress import SweepCancelled

# --------------------------------------------------------------------------- #
# Sensibilidad ACO
# --------------------------------------------------------------------------- #


def _aco_series() -> list[dict]:
    return [
        *aco_sensitivity_service.ANT_SENSITIVITY_SERIES,
        *aco_sensitivity_service.ITERATION_SENSITIVITY_SERIES,
        *aco_sensitivity_service.HYPERPARAMETER_SENSITIVITY_SERIES,
    ]


def _patch_aco(monkeypatch, tmp_path, executed: list[str]):
    saved: list[dict] = []

    def fake_run(db_, scenario_id, **kwargs):
        executed.append(kwargs.get("aco_iterations", 20))
        return {
            "kpis": {
                "distanceKm": {"current": 28.4, "optimized": 22.0},
                "uncoveredPoints": 0,
                "engineMetrics": {
                    "computationSeconds": 1.0,
                    "acoSeconds": 0.5,
                    "acoIterationsRun": kwargs.get("aco_iterations", 20),
                    "acoStoppedEarly": False,
                },
            }
        }

    monkeypatch.setattr(aco_sensitivity_service, "run_optimization_engine", fake_run)
    monkeypatch.setattr(
        aco_sensitivity_service,
        "save_aco_sensitivity",
        lambda payload: saved.append(payload) or tmp_path / "aco_sensitivity.json",
    )
    return saved


def test_aco_sensitivity_on_run_reports_every_case(monkeypatch, tmp_path):
    calls: list[tuple[int, int, str]] = []
    executed: list = []
    saved = _patch_aco(monkeypatch, tmp_path, executed)

    payload = aco_sensitivity_service.run_aco_sensitivity(
        MagicMock(), on_run=lambda i, t, label: calls.append((i, t, label))
    )

    total = len(_aco_series())
    assert [call[0] for call in calls] == list(range(total))
    assert {call[1] for call in calls} == {total}
    assert [call[2] for call in calls] == [case["label"] for case in _aco_series()]
    assert len(executed) == total
    assert len(payload["runs"]) == total
    assert len(saved) == 1


def test_aco_sensitivity_cancel_between_runs_skips_cache(monkeypatch, tmp_path):
    calls: list[tuple[int, int, str]] = []
    executed: list = []
    saved = _patch_aco(monkeypatch, tmp_path, executed)

    with pytest.raises(SweepCancelled):
        aco_sensitivity_service.run_aco_sensitivity(
            MagicMock(),
            on_run=lambda i, t, label: calls.append((i, t, label)),
            cancel_check=lambda: len(executed) >= 3,
        )

    assert len(executed) == 3
    # No se reporta la corrida cancelada ni se escribe la caché.
    assert [call[0] for call in calls] == [0, 1, 2]
    assert saved == []


def test_aco_sensitivity_cancel_before_first_run(monkeypatch, tmp_path):
    executed: list = []
    saved = _patch_aco(monkeypatch, tmp_path, executed)

    with pytest.raises(SweepCancelled):
        aco_sensitivity_service.run_aco_sensitivity(MagicMock(), cancel_check=lambda: True)

    assert executed == []
    assert saved == []


# --------------------------------------------------------------------------- #
# Barrido de pesos del objetivo
# --------------------------------------------------------------------------- #


def _patch_sweep(monkeypatch, tmp_path, executed: list[str]):
    saved: list[dict] = []

    def fake_run(db_, scenario_id, **kwargs):
        executed.append("run")
        return {
            "kpis": {
                "distanceKm": {"current": 30.0, "optimized": 25.0},
                "activeVehicles": 4,
                "fleetUtilizationPct": 70.0,
                "maxRouteHours": 7.5,
                "shiftSlackHours": 0.5,
                "finishUnderTargetPct": 100.0,
                "workloadStdHours": 0.4,
                "fairnessIndex": 0.9,
                "vehicleWorkloadHours": [7.5, 7.0, 6.0, 5.0],
                "uncoveredPoints": 0,
                "engineMetrics": {"computationSeconds": 1.0, "minActiveVehicles": None},
            }
        }

    monkeypatch.setattr(multiobjective_sweep_service, "run_optimization_engine", fake_run)
    monkeypatch.setattr(
        multiobjective_sweep_service,
        "save_multiobjective_sweep",
        lambda payload: saved.append(payload) or tmp_path / "sweep.json",
    )
    return saved


def test_multiobjective_sweep_on_run_reports_every_case(monkeypatch, tmp_path):
    calls: list[tuple[int, int, str]] = []
    executed: list = []
    saved = _patch_sweep(monkeypatch, tmp_path, executed)

    payload = multiobjective_sweep_service.run_multiobjective_sweep(
        MagicMock(), on_run=lambda i, t, label: calls.append((i, t, label))
    )

    cases = multiobjective_sweep_service.SWEEP_CASES
    assert [call[0] for call in calls] == list(range(len(cases)))
    assert {call[1] for call in calls} == {len(cases)}
    assert [call[2] for call in calls] == [case["label"] for case in cases]
    assert len(executed) == len(cases)
    assert len(payload["runs"]) == len(cases)
    assert len(saved) == 1


def test_multiobjective_sweep_cancel_between_runs_skips_cache(monkeypatch, tmp_path):
    calls: list[tuple[int, int, str]] = []
    executed: list = []
    saved = _patch_sweep(monkeypatch, tmp_path, executed)

    with pytest.raises(SweepCancelled):
        multiobjective_sweep_service.run_multiobjective_sweep(
            MagicMock(),
            on_run=lambda i, t, label: calls.append((i, t, label)),
            cancel_check=lambda: len(executed) >= 2,
        )

    assert len(executed) == 2
    assert [call[0] for call in calls] == [0, 1]
    assert saved == []


def test_multiobjective_sweep_without_hooks_is_unchanged(monkeypatch, tmp_path):
    """Regresión: sin hooks el barrido produce el payload completo."""
    executed: list = []
    saved = _patch_sweep(monkeypatch, tmp_path, executed)

    payload = multiobjective_sweep_service.run_multiobjective_sweep(MagicMock())

    assert len(payload["runs"]) == len(multiobjective_sweep_service.SWEEP_CASES)
    assert "paretoFrontier" in payload
    assert set(payload["acceptance"]) == {"ac1", "ac2", "ac3"}
    assert len(saved) == 1
