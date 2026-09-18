"""Persistencia incremental del barrido (E0).

El salvavidas de trabajo en curso (``data/cache/phase13/*.jsonl``) existe para que un corte no
cueste el barrido entero. La fila de ``calibration_sweeps`` se sigue escribiendo **al final**
(ADR-011): aquí se prueba que un barrido cortado a mitad se reanuda ejecutando solo las
corridas que faltan y produce el mismo payload que una corrida completa.

Sin motor ni BD reales: el engine y el almacén se parchean, que es lo que hace comprobable el
contrato sin gastar ~20 min de CPU.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.services import aco_sensitivity_service as svc
from app.services.sweep_progress import SweepCancelled

CASES: list[dict[str, object]] = [
    {
        "label": f"caso {index}",
        "acoAnts": 12,
        "acoIterations": 20,
        "axis": "custom",
        "acoAlpha": 1.0,
        "acoBeta": float(index * 2 + 1),
        "acoRho": 0.12,
        "pheromoneQ": 1.0,
        "acoPatience": 5,
    }
    for index in range(3)
]
SEEDS = [1, 2, 3]
TOTAL = len(CASES) * len(SEEDS)


def _patch(monkeypatch, executed: list[int]) -> list[dict]:
    """Engine y almacén falsos; ``executed`` acumula las semillas que sí se corrieron."""

    def fake_run(db_, scenario_id, **kwargs):
        seed = kwargs.get("seed")
        executed.append(seed)
        return {
            "kpis": {
                "distanceKm": {"current": 28.4, "optimized": 22.0 + seed / 100},
                "uncoveredPoints": 0,
                "engineMetrics": {
                    "computationSeconds": 1.0,
                    "acoSeconds": 0.5,
                    "acoIterationsRun": kwargs.get("aco_iterations", 20),
                    "acoStoppedEarly": False,
                },
            }
        }

    saved: list[dict] = []
    monkeypatch.setattr(svc, "run_optimization_engine", fake_run)
    monkeypatch.setattr(
        svc,
        "record_sweep",
        lambda db, *, sweep, payload, instance_fingerprint=None: saved.append(payload),
    )
    return saved


def _run(db, *, path, **overrides):
    return svc.run_aco_sensitivity(
        db,
        cases=CASES,
        seeds=SEEDS,
        sweep="method",
        phase="factorial",
        resume_path=path,
        **overrides,
    )


def test_interrupted_sweep_is_resumed_running_only_the_missing_runs(monkeypatch, tmp_path):
    executed: list[int] = []
    saved = _patch(monkeypatch, executed)
    path = tmp_path / "method-factorial.jsonl"

    with pytest.raises(SweepCancelled):
        _run(MagicMock(), path=path, cancel_check=lambda: len(executed) >= 3)

    assert len(executed) == 3
    # Un barrido cortado no escribe en la BD, pero deja el salvavidas.
    assert saved == []
    assert path.exists()

    executed.clear()
    payload = _run(MagicMock(), path=path, resume=True)

    assert len(executed) == TOTAL - 3
    assert payload["reusedRuns"] == 3
    assert len(payload["runs"]) == TOTAL
    assert saved and len(saved) == 1
    # Guardado en la BD: el salvavidas se borra.
    assert not path.exists()


def test_resumed_payload_matches_a_complete_run(monkeypatch, tmp_path):
    executed: list[int] = []
    _patch(monkeypatch, executed)
    complete = _run(MagicMock(), path=tmp_path / "completo.jsonl")

    executed.clear()
    interrupted = tmp_path / "cortado.jsonl"
    with pytest.raises(SweepCancelled):
        _run(MagicMock(), path=interrupted, cancel_check=lambda: len(executed) >= 4)
    executed.clear()
    resumed = _run(MagicMock(), path=interrupted, resume=True)

    assert resumed["runs"] == complete["runs"]
    assert resumed["budget"] == complete["budget"]


def test_a_fresh_sweep_discards_the_previous_journal(monkeypatch, tmp_path):
    executed: list[int] = []
    _patch(monkeypatch, executed)
    path = tmp_path / "method-factorial.jsonl"
    # Restos de un barrido anterior con otro diseño: no deben reutilizarse sin --resume.
    path.write_text(
        json.dumps({"identity": _identity(CASES[0], 1), "run": {"label": "viejo", "seed": 1}})
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(SweepCancelled):
        _run(MagicMock(), path=path, cancel_check=lambda: len(executed) >= 1)

    assert executed == [1]
    entries = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(entries) == 1
    assert json.loads(entries[0])["run"]["label"] != "viejo"


def test_resume_ignores_a_corrupt_line_and_keeps_the_readable_ones(monkeypatch, tmp_path):
    executed: list[int] = []
    _patch(monkeypatch, executed)
    path = tmp_path / "method-factorial.jsonl"
    cached_run = {"label": "caso 0 · semilla 1", "seed": 1, "distanceKmOptimized": 10.0}
    path.write_text(
        "esto no es json\n"
        + json.dumps({"identity": _identity(CASES[0], 1), "run": cached_run})
        + "\n"
        "{}\n",
        encoding="utf-8",
    )

    payload = _run(MagicMock(), path=path, resume=True)

    assert payload["reusedRuns"] == 1
    assert len(executed) == TOTAL - 1
    assert payload["runs"][0] == cached_run


def test_resume_without_a_journal_runs_everything(monkeypatch, tmp_path):
    executed: list[int] = []
    _patch(monkeypatch, executed)

    payload = _run(MagicMock(), path=tmp_path / "no-existe.jsonl", resume=True)

    assert payload["reusedRuns"] == 0
    assert len(executed) == TOTAL


def test_resume_path_is_derived_from_sweep_and_phase():
    path = svc.calibration_resume_path(sweep="method", phase="rsm")

    assert path.name == "method-rsm.jsonl"
    assert path.parent.name == "phase13"
    assert svc.calibration_resume_path(sweep="sensitivity").name == "sensitivity-default.jsonl"


def test_case_identity_separates_replicates_with_the_same_parameters():
    """Los centros del factorial comparten parámetros y solo difieren en la etiqueta."""
    center = {**CASES[0], "label": "centro 1"}
    replica = {**CASES[0], "label": "centro 2"}

    assert _identity(center, 7) != _identity(replica, 7)
    assert _identity(center, 7) == _identity({**center}, 7)
    assert _identity(center, 7) != _identity(center, 8)
    assert _identity(center, 7) != _identity({**center, "acoBeta": 9.0}, 7)


def _identity(case: dict, seed: int) -> str:
    return svc._case_identity(case, seed)
