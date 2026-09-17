"""Validación de la combinación de parámetros ACO (Fase 13 · hueco del barrido OFAT).

Cubre: normalización del perfil, veredicto por distancia con guardarraíles, las dos
corridas (control + combinación), cancelación sin escribir caché y el contrato HTTP/job.
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.v1 import benchmarks
from app.services import aco_validation_service as validation
from app.services import optimization_job_service as job_svc
from app.services.sweep_progress import CALIBRATION_SWEEPS, SWEEP_VALIDATION, SweepCancelled

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _kpis(optimized: float, *, uncovered: int = 0, early: bool = False) -> dict:
    return {
        "kpis": {
            "distanceKm": {"current": 28.4, "optimized": optimized},
            "uncoveredPoints": uncovered,
            "engineMetrics": {
                "computationSeconds": 1.0,
                "acoSeconds": 0.5,
                "acoIterationsRun": 20,
                "acoStoppedEarly": early,
            },
        }
    }


def _patch_engine(monkeypatch, distances: list[float], executed: list[dict]) -> None:
    """Motor falso: devuelve una distancia por corrida y registra los kwargs usados."""
    remaining = list(distances)

    def fake_run(db_, scenario_id, **kwargs):
        executed.append(kwargs)
        return _kpis(remaining.pop(0) if remaining else distances[-1])

    monkeypatch.setattr(validation, "run_optimization_engine", fake_run)


def _capture_records(monkeypatch, tmp_path) -> list[dict]:
    saved: list[dict] = []
    monkeypatch.setattr(
        validation,
        "record_sweep",
        lambda db, *, sweep, payload, instance_fingerprint=None: saved.append(payload),
    )
    return saved


def _run(role: str, km: float, **patch) -> dict:
    return {"label": role, "role": role, "params": dict(validation.STANDARD_PARAMS), "distanceKmOptimized": km, **patch}


@pytest.fixture(autouse=True)
def reset_calibration_slot():
    job_svc.reset_calibration_slot_for_tests()
    yield
    job_svc.reset_calibration_slot_for_tests()


# --------------------------------------------------------------------------- #
# Perfil
# --------------------------------------------------------------------------- #


def test_normalize_profile_fills_missing_fields_from_standard():
    assert validation.normalize_profile(None) == validation.STANDARD_PARAMS
    assert validation.normalize_profile({"acoBeta": 5}) == {
        **validation.STANDARD_PARAMS,
        "acoBeta": 5.0,
    }

    # Los conteos se fuerzan a entero y los hiperparámetros a flotante.
    normalized = validation.normalize_profile({"acoAnts": "8", "acoIterations": 40, "acoRho": 0.3})
    assert normalized["acoAnts"] == 8
    assert normalized["acoIterations"] == 40
    assert normalized["acoRho"] == 0.3


def test_same_profile_requires_every_field_to_match():
    assert validation.same_profile(dict(validation.STANDARD_PARAMS), validation.STANDARD_PARAMS)
    assert not validation.same_profile(
        {**validation.STANDARD_PARAMS, "acoBeta": 5.0}, validation.STANDARD_PARAMS
    )
    # Un perfil incompleto no es «el mismo»: faltan campos.
    assert not validation.same_profile({"acoBeta": 3}, validation.STANDARD_PARAMS)


# --------------------------------------------------------------------------- #
# Veredicto
# --------------------------------------------------------------------------- #


def test_build_verdict_flags_better_and_worse():
    better = validation.build_verdict([_run("standard", 190.8), _run("recommended", 184.7)])

    assert better["outcome"] == "better"
    assert better["reason"] is None
    assert better["standardKm"] == 190.8
    assert better["recommendedKm"] == 184.7
    assert better["deltaKm"] == -6.1
    assert better["deltaPct"] == -3.2

    worse = validation.build_verdict([_run("standard", 184.7), _run("recommended", 195.0)])

    assert worse["outcome"] == "worse"
    assert worse["deltaKm"] == 10.3


def test_build_verdict_treats_noise_under_half_a_percent_as_a_tie():
    # 0,5 % de 190,8 km ≈ 0,95 km: por debajo es empate, no una mejora que citar.
    tie = validation.build_verdict([_run("standard", 190.8), _run("recommended", 190.0)])
    assert tie["outcome"] == "equal"
    assert tie["deltaKm"] == -0.8

    just_above = validation.build_verdict([_run("standard", 190.8), _run("recommended", 189.8)])
    assert just_above["outcome"] == "better"


def test_build_verdict_refuses_to_compare_broken_runs():
    error = validation.build_verdict(
        [_run("standard", 190.8), _run("recommended", 0, error="ACO agotó el tiempo")]
    )
    assert error["outcome"] == "not-comparable"
    assert error["reason"] == "error"
    assert error["deltaKm"] is None

    uncovered = validation.build_verdict(
        [_run("standard", 190.8), _run("recommended", 180.0, uncoveredPoints=2)]
    )
    assert uncovered["outcome"] == "not-comparable"
    assert uncovered["reason"] == "uncovered"

    missing = validation.build_verdict([_run("standard", 190.8)])
    assert missing["outcome"] == "not-comparable"
    assert missing["reason"] == "missing"


# --------------------------------------------------------------------------- #
# Las dos corridas
# --------------------------------------------------------------------------- #


def test_run_aco_validation_runs_control_then_combination(monkeypatch, tmp_path):
    executed: list[dict] = []
    saved = _capture_records(monkeypatch, tmp_path)
    _patch_engine(monkeypatch, [190.8, 184.7], executed)

    calls: list[tuple[int, int, str]] = []
    payload = validation.run_aco_validation(
        MagicMock(),
        profile={"acoBeta": 5},
        instance_fingerprint="sello-test",
        on_run=lambda i, t, label: calls.append((i, t, label)),
    )

    assert [call[0] for call in calls] == [0, 1]
    assert {call[1] for call in calls} == {2}
    assert len(executed) == 2
    # La primera corrida es el control (perfil estándar) y la segunda la combinación.
    assert executed[0]["aco_beta"] == 3.0
    assert executed[0]["aco_ants"] == 12
    assert executed[1]["aco_beta"] == 5.0
    assert executed[1]["aco_ants"] == 12

    assert payload["profile"]["acoBeta"] == 5.0
    assert payload["sameParams"] is False
    assert payload["instanceFingerprint"] == "sello-test"
    assert [run["role"] for run in payload["runs"]] == ["standard", "recommended"]
    assert payload["verdict"]["outcome"] == "better"
    assert len(saved) == 1


def test_run_aco_validation_marks_the_standard_profile_against_itself(monkeypatch, tmp_path):
    executed: list[dict] = []
    _capture_records(monkeypatch, tmp_path)
    _patch_engine(monkeypatch, [190.8, 190.8], executed)

    payload = validation.run_aco_validation(MagicMock())

    assert payload["sameParams"] is True
    assert payload["verdict"]["outcome"] == "equal"


def test_run_aco_validation_cancelled_before_the_first_run_skips_the_record(monkeypatch, tmp_path):
    executed: list[dict] = []
    saved = _capture_records(monkeypatch, tmp_path)
    _patch_engine(monkeypatch, [190.8, 184.7], executed)

    with pytest.raises(SweepCancelled):
        validation.run_aco_validation(MagicMock(), cancel_check=lambda: True)

    assert executed == []
    assert saved == []


def test_run_aco_validation_cancelled_between_runs_skips_the_record(monkeypatch, tmp_path):
    executed: list[dict] = []
    saved = _capture_records(monkeypatch, tmp_path)
    _patch_engine(monkeypatch, [190.8, 184.7], executed)

    with pytest.raises(SweepCancelled):
        validation.run_aco_validation(MagicMock(), cancel_check=lambda: len(executed) >= 1)

    assert len(executed) == 1
    assert saved == []


# --------------------------------------------------------------------------- #
# Alta en el almacén
# --------------------------------------------------------------------------- #


def test_run_aco_validation_records_the_run(monkeypatch):
    """El servicio guarda la corrida con el barrido `validation` y su sello."""
    captured: dict = {}
    monkeypatch.setattr(
        validation,
        "record_sweep",
        lambda db, *, sweep, payload, instance_fingerprint=None: captured.update(
            {"sweep": sweep, "payload": payload, "stamp": instance_fingerprint}
        ),
    )
    monkeypatch.setattr(
        validation, "run_optimization_engine", lambda db_, scenario_id, **kwargs: _kpis(190.0)
    )

    validation.run_aco_validation(
        MagicMock(), profile={"acoBeta": 5}, instance_fingerprint="sello-x"
    )

    assert captured["sweep"] == "validation"
    assert captured["stamp"] == "sello-x"
    assert captured["payload"]["profile"]["acoBeta"] == 5.0


# --------------------------------------------------------------------------- #
# Job y contrato HTTP
# --------------------------------------------------------------------------- #


def test_validation_is_a_calibration_sweep():
    assert SWEEP_VALIDATION in CALIBRATION_SWEEPS


def test_validation_job_ignores_cache_reuse(monkeypatch):
    monkeypatch.setattr(job_svc, "SessionLocal", lambda: MagicMock())
    monkeypatch.setattr(job_svc, "current_fingerprint", lambda db, *, scenario_id: "sello-test")
    ran: list[dict] = []

    # Hay una corrida vigente del mismo escenario/semilla, pero la validación corre igual.
    monkeypatch.setattr(
        job_svc, "_sweep_latest_payload", lambda db, sweep: {"scenarioId": "normal", "seed": 42}
    )

    def fake_validation(
        db, *, scenario_id, seed, profile=None, on_run=None, cancel_check=None, instance_fingerprint=None
    ):
        ran.append(profile)
        return {"runs": [], "verdict": {"outcome": "equal"}}

    monkeypatch.setattr(job_svc, "_sweep_runner", lambda sweep: fake_validation)

    job = job_svc.create_calibration_job(
        SWEEP_VALIDATION, db=MagicMock(), refresh=False, profile={"acoBeta": 5}
    )

    deadline = time.time() + 5
    view = job_svc.get_calibration_job_view(job.id)
    while view["status"] in {"pending", "running"} and time.time() < deadline:
        time.sleep(0.01)
        view = job_svc.get_calibration_job_view(job.id)

    assert view["status"] == "completed"
    assert view["sweep"] == SWEEP_VALIDATION
    assert ran == [{"acoBeta": 5}]


def test_validation_endpoints_are_registered():
    routes = {
        (route.path, tuple(sorted(route.methods))): route.status_code
        for route in benchmarks.router.routes
    }

    assert routes[("/benchmarks/aco/validation/jobs", ("POST",))] == 202
    assert ("/benchmarks/aco/validation", ("GET",)) in routes


def test_validation_endpoint_forwards_the_profile(monkeypatch):
    from app.schemas.calibration import AcoValidationJobRequest

    captured: dict = {}

    def fake_create(sweep, **kwargs):
        captured.update(kwargs)
        captured["sweep"] = sweep
        return SimpleNamespace(id="job-validacion")

    monkeypatch.setattr(benchmarks, "create_calibration_job", fake_create)

    body = AcoValidationJobRequest(profile={"acoAnts": 8, "acoBeta": 5})

    assert benchmarks.start_aco_validation_job(body, MagicMock(), MagicMock()) == {
        "jobId": "job-validacion"
    }
    assert captured["sweep"] == SWEEP_VALIDATION
    assert captured["profile"] == {
        "acoAnts": 8,
        "acoIterations": 20,
        "acoAlpha": 1.0,
        "acoBeta": 5.0,
        "acoRho": 0.12,
        "pheromoneQ": 1.0,
    }


def test_validation_request_rejects_unreasonable_values():
    from pydantic import ValidationError

    from app.schemas.calibration import AcoValidationJobRequest

    with pytest.raises(ValidationError):
        AcoValidationJobRequest(profile={"acoBeta": -1})
    with pytest.raises(ValidationError):
        AcoValidationJobRequest(profile={"acoRho": 2})
    with pytest.raises(ValidationError):
        AcoValidationJobRequest(profile={"acoAnts": 0})


def test_validation_read_exposes_the_verdict(monkeypatch, tmp_path):
    payload = {
        "generatedAt": "2026-09-17T00:00:00+00:00",
        "scenarioId": "normal",
        "seed": 42,
        "profile": {"acoBeta": 5},
        "runs": [],
        "verdict": {"outcome": "better", "deltaKm": -6.1},
    }
    monkeypatch.setattr(benchmarks, "load_aco_validation", lambda db: payload)
    # El sello de instancia lo cubre test_calibration_fingerprint.
    monkeypatch.setattr(benchmarks, "with_freshness", lambda payload_, db, *, scenario_id: payload_)

    result = benchmarks.get_aco_validation(MagicMock(), MagicMock())

    assert result["verdict"]["outcome"] == "better"


def test_validation_read_404_without_evidence(monkeypatch, tmp_path):
    monkeypatch.setattr(benchmarks, "load_aco_validation", lambda db: None)

    with pytest.raises(HTTPException) as excinfo:
        benchmarks.get_aco_validation(MagicMock(), MagicMock())

    assert excinfo.value.status_code == 404
