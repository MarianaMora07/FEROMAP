"""Jobs asíncronos de calibración del motor (Fase 13 · Fase 2).

Cubre: progreso real y monótono (``current``/``total``/``currentLabel``), cancelación
sin resultado, serialización a 1 job concurrente, reutilización de caché con
``refresh=False``, persistencia con ``jobType="calibration"`` y el contrato HTTP.
"""

from __future__ import annotations

import json
import threading
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.v1 import benchmarks
from app.services import optimization_job_service as svc
from app.services.sweep_progress import (
    SWEEP_OBJECTIVE,
    SWEEP_SENSITIVITY,
    SweepCancelled,
)


@pytest.fixture(autouse=True)
def reset_calibration_slot():
    svc.reset_calibration_slot_for_tests()
    yield
    svc.reset_calibration_slot_for_tests()


@pytest.fixture(autouse=True)
def stub_instance_fingerprint(monkeypatch):
    """El sello de instancia consulta la BD real; en estos tests se sustituye."""
    monkeypatch.setattr(svc, "current_fingerprint", lambda db, *, scenario_id: "sello-test")


def _wait_for_status(job_id: str, expected: set[str], timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    view = svc.get_calibration_job_view(job_id)
    while view["status"] not in expected and time.time() < deadline:
        time.sleep(0.01)
        view = svc.get_calibration_job_view(job_id)
    return view


# --------------------------------------------------------------------------- #
# Progreso
# --------------------------------------------------------------------------- #


def test_calibration_job_reports_monotonic_progress(monkeypatch):
    monkeypatch.setattr(svc, "SessionLocal", lambda: MagicMock())
    total = 4
    seen: list[dict] = []

    def fake_sweep(db, *, scenario_id, seed, on_run, cancel_check, instance_fingerprint=None):
        for index in range(total):
            if cancel_check():
                raise SweepCancelled("cancelado")
            on_run(index, total, f"caso {index + 1}")
            time.sleep(0.02)
        return {"runs": [], "scenarioId": scenario_id, "seed": seed}

    monkeypatch.setattr(svc, "_sweep_runner", lambda sweep: fake_sweep)

    job = svc.create_calibration_job(SWEEP_SENSITIVITY)
    view = svc.get_calibration_job_view(job.id)
    deadline = time.time() + 5
    while view["status"] in {"pending", "running"} and time.time() < deadline:
        seen.append(view)
        time.sleep(0.005)
        view = svc.get_calibration_job_view(job.id)

    assert view["status"] == "completed"
    assert view["progress"] == 100
    assert view["jobType"] == "calibration"
    assert view["sweep"] == SWEEP_SENSITIVITY
    assert view["total"] == total
    assert view["current"] == total
    assert view["currentLabel"] == f"caso {total}"
    assert view["result"]["scenarioId"] == "normal"
    # El progreso nunca retrocede y refleja corridas terminadas sobre el total.
    progresses = [snapshot["progress"] for snapshot in seen]
    assert progresses == sorted(progresses)
    assert all(0 <= value <= 100 for value in progresses)
    # La etiqueta de la corrida en curso viaja desde `on_run`.
    assert any(snapshot["currentLabel"] for snapshot in seen)
    assert any(snapshot["current"] for snapshot in seen)


# --------------------------------------------------------------------------- #
# Cancelación
# --------------------------------------------------------------------------- #


def test_calibration_job_cancel_marks_cancelled_without_result(monkeypatch):
    monkeypatch.setattr(svc, "SessionLocal", lambda: MagicMock())
    started = threading.Event()
    release = threading.Event()

    def fake_sweep(db, *, scenario_id, seed, on_run, cancel_check, instance_fingerprint=None):
        on_run(0, 3, "caso 1")
        started.set()
        release.wait(timeout=5)
        if cancel_check():
            raise SweepCancelled("cancelado")
        return {"runs": []}

    monkeypatch.setattr(svc, "_sweep_runner", lambda sweep: fake_sweep)

    job = svc.create_calibration_job(SWEEP_OBJECTIVE)
    assert started.wait(timeout=5)

    assert svc.cancel_optimization_job(job.id)["status"] == "cancelled"
    release.set()

    view = _wait_for_status(job.id, {"cancelled", "completed", "failed"})
    assert view["status"] == "cancelled"
    assert view["result"] is None
    assert view["error"] is None


def test_calibration_job_cancelled_while_waiting_for_slot(monkeypatch):
    monkeypatch.setattr(svc, "SessionLocal", lambda: MagicMock())
    running = threading.Event()
    release = threading.Event()

    def fake_sweep(db, *, scenario_id, seed, on_run, cancel_check, instance_fingerprint=None):
        running.set()
        release.wait(timeout=5)
        return {"runs": []}

    monkeypatch.setattr(svc, "_sweep_runner", lambda sweep: fake_sweep)

    first = svc.create_calibration_job(SWEEP_SENSITIVITY)
    assert running.wait(timeout=5)

    waiting = svc.create_calibration_job(SWEEP_SENSITIVITY)
    svc.cancel_optimization_job(waiting.id)

    view = _wait_for_status(waiting.id, {"cancelled", "completed", "failed"})
    assert view["status"] == "cancelled"
    assert view["result"] is None

    release.set()
    _wait_for_status(first.id, {"completed", "failed", "cancelled"})


# --------------------------------------------------------------------------- #
# Concurrencia
# --------------------------------------------------------------------------- #


def test_calibration_jobs_run_one_at_a_time(monkeypatch):
    monkeypatch.setattr(svc, "SessionLocal", lambda: MagicMock())
    running = threading.Event()
    release = threading.Event()
    started: list[str] = []

    def fake_sweep(db, *, scenario_id, seed, on_run, cancel_check, instance_fingerprint=None):
        started.append(scenario_id)
        running.set()
        release.wait(timeout=5)
        return {"runs": []}

    monkeypatch.setattr(svc, "_sweep_runner", lambda sweep: fake_sweep)

    first = svc.create_calibration_job(SWEEP_SENSITIVITY)
    assert running.wait(timeout=5)
    second = svc.create_calibration_job(SWEEP_OBJECTIVE)

    time.sleep(0.2)
    assert len(started) == 1
    assert svc.get_calibration_job_view(second.id)["status"] in {"pending", "running"}

    release.set()
    assert _wait_for_status(first.id, {"completed", "failed", "cancelled"})["status"] == "completed"
    second_view = _wait_for_status(second.id, {"completed", "failed", "cancelled"})
    assert second_view["status"] == "completed"
    assert len(started) == 2


# --------------------------------------------------------------------------- #
# Reutilización de caché (`refresh=False`) y validación
# --------------------------------------------------------------------------- #


def test_calibration_job_refresh_false_reuses_matching_cache(monkeypatch):
    monkeypatch.setattr(svc, "SessionLocal", lambda: MagicMock())
    cached = {"generatedAt": "2026-09-17T00:00:00+00:00", "scenarioId": "normal", "seed": 42}
    monkeypatch.setattr(svc, "_sweep_cache_loader", lambda sweep: cached)
    monkeypatch.setattr(
        svc, "_sweep_runner", lambda sweep: pytest.fail("no debe recalcular con refresh=False")
    )

    job = svc.create_calibration_job(SWEEP_SENSITIVITY, refresh=False)

    view = svc.get_calibration_job_view(job.id)
    assert view["status"] == "completed"
    assert view["progress"] == 100
    assert view["result"] == cached


def test_calibration_job_refresh_false_with_other_seed_runs(monkeypatch):
    monkeypatch.setattr(svc, "SessionLocal", lambda: MagicMock())
    cached = {"scenarioId": "normal", "seed": 7, "runs": []}
    ran: list[int] = []

    def fake_sweep(db, *, scenario_id, seed, on_run, cancel_check, instance_fingerprint=None):
        ran.append(seed)
        return {"runs": [], "scenarioId": scenario_id, "seed": seed}

    monkeypatch.setattr(svc, "_sweep_cache_loader", lambda sweep: cached)
    monkeypatch.setattr(svc, "_sweep_runner", lambda sweep: fake_sweep)

    job = svc.create_calibration_job(SWEEP_SENSITIVITY, seed=99, refresh=False)

    view = _wait_for_status(job.id, {"completed", "failed", "cancelled"})
    assert view["status"] == "completed"
    assert ran == [99]


def test_create_calibration_job_rejects_unknown_sweep():
    with pytest.raises(ValueError):
        svc.create_calibration_job("no-existe")


# --------------------------------------------------------------------------- #
# Jornada declarada del barrido de pesos (opción 2: falla en vez de ignorarse)
# --------------------------------------------------------------------------- #


def _objective_request(**overrides):
    from app.schemas.calibration import ObjectiveSweepJobRequest

    return ObjectiveSweepJobRequest(**overrides)


def test_validate_sweep_duration_accepts_none_and_covered_shifts():
    from app.services.multiobjective_sweep_service import (
        SUPPORTED_SWEEP_SHIFTS,
        validate_sweep_duration,
    )

    assert SUPPORTED_SWEEP_SHIFTS == frozenset({8})
    assert validate_sweep_duration(None) is None
    assert validate_sweep_duration(8) == 8


def test_validate_sweep_duration_rejects_shift_outside_the_sweep():
    from app.services.multiobjective_sweep_service import validate_sweep_duration

    with pytest.raises(ValueError) as excinfo:
        validate_sweep_duration(10)

    message = str(excinfo.value)
    assert "durationHours=10" in message
    assert "8 h" in message


def test_objective_sweep_endpoint_rejects_unsupported_duration():
    with pytest.raises(HTTPException) as excinfo:
        benchmarks.start_objective_sweep_job(_objective_request(durationHours=12), MagicMock())

    assert excinfo.value.status_code == 400
    assert "durationHours=12" in str(excinfo.value.detail)


def test_objective_sweep_endpoint_accepts_declared_shift(monkeypatch):
    created: list[str] = []

    def fake_create(sweep, *, scenario_id=None, seed=None, refresh=True):
        created.append(sweep)
        return SimpleNamespace(id="job-declarado")

    monkeypatch.setattr(benchmarks, "create_calibration_job", fake_create)

    assert benchmarks.start_objective_sweep_job(_objective_request(durationHours=8), MagicMock()) == {
        "jobId": "job-declarado"
    }
    assert created == [SWEEP_OBJECTIVE]


def test_objective_sweep_endpoint_accepts_omitted_shift(monkeypatch):
    monkeypatch.setattr(
        benchmarks,
        "create_calibration_job",
        lambda sweep, **kwargs: SimpleNamespace(id="job-omitido"),
    )

    assert benchmarks.start_objective_sweep_job(_objective_request(), MagicMock()) == {"jobId": "job-omitido"}


# --------------------------------------------------------------------------- #
# Persistencia e historial
# --------------------------------------------------------------------------- #


class _FakeDb:
    def __init__(self, record: SimpleNamespace) -> None:
        self._record = record
        self.committed = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def get(self, _model, _pk):
        return self._record

    def commit(self) -> None:
        self.committed += 1

    def close(self) -> None:
        return None


def test_calibration_job_persists_calibration_type_and_params(monkeypatch):
    record = SimpleNamespace()
    fake = _FakeDb(record)
    monkeypatch.setattr(svc, "SessionLocal", lambda: fake)

    def fake_sweep(db, *, scenario_id, seed, on_run, cancel_check, instance_fingerprint=None):
        return {"runs": []}

    monkeypatch.setattr(svc, "_sweep_runner", lambda sweep: fake_sweep)

    job = svc.create_calibration_job(SWEEP_OBJECTIVE)
    assert _wait_for_status(job.id, {"completed", "failed", "cancelled"})["status"] == "completed"

    assert record.job_type == "calibration"
    assert record.status == "completed"
    params = json.loads(record.params_json)
    assert params["sweep"] == SWEEP_OBJECTIVE
    assert params["scenario_id"] == "normal"
    assert params["seed"] == 42
    assert fake.committed >= 1


# --------------------------------------------------------------------------- #
# Contrato HTTP
# --------------------------------------------------------------------------- #


def _routes_by_path() -> dict[tuple[str, tuple[str, ...]], int | None]:
    return {
        (route.path, tuple(sorted(route.methods))): route.status_code
        for route in benchmarks.router.routes
    }


def test_calibration_endpoints_are_registered():
    routes = _routes_by_path()

    assert routes[("/benchmarks/aco/sensitivity/jobs", ("POST",))] == 202
    assert routes[("/benchmarks/objective/sweep/jobs", ("POST",))] == 202
    assert ("/benchmarks/calibration/jobs/{job_id}", ("GET",)) in routes
    assert ("/benchmarks/calibration/jobs/{job_id}/cancel", ("POST",)) in routes
    # Regresión: los barridos síncronos existentes siguen expuestos.
    assert ("/benchmarks/aco/sensitivity", ("GET",)) in routes
    assert ("/benchmarks/aco/sensitivity", ("POST",)) in routes


def test_sync_sensitivity_post_accepts_scenario_and_seed(monkeypatch):
    captured: dict = {}

    def fake_run(db, **kwargs):
        captured.update(kwargs)
        return {"runs": []}

    monkeypatch.setattr(benchmarks, "run_aco_sensitivity", fake_run)

    benchmarks.generate_aco_sensitivity(MagicMock(), MagicMock(), "rain", 7)
    assert captured == {"scenario_id": "rain", "seed": 7}

    captured.clear()
    benchmarks.generate_aco_sensitivity(MagicMock(), MagicMock(), None, None)
    assert captured == {}


def test_calibration_job_view_rejects_unknown_job():
    with pytest.raises(LookupError):
        svc.get_calibration_job_view("no-existe")


# --------------------------------------------------------------------------- #
# Lectura en caché del barrido de pesos (Fase 3)
# --------------------------------------------------------------------------- #


def test_objective_sweep_cache_read_exposes_frontier_and_acceptance(monkeypatch, tmp_path):
    from app.services import multiobjective_sweep_service as sweep

    payload = {
        "generatedAt": "2026-09-17T00:00:00+00:00",
        "durationSeconds": 10.0,
        "scenarioId": "normal",
        "seed": 42,
        "maxRouteHoursTarget": 8.0,
        "runs": [{"label": "base 8 h (w=0)", "distanceKmOptimized": 25.0}],
        "paretoFrontier": [{"label": "base 8 h (w=0)", "distanceKmOptimized": 25.0}],
        "acceptance": {
            "ac1": {"ok": True},
            "ac2": {"ok": True},
            "ac3": {"ok": None},
        },
    }
    path = tmp_path / "multiobjective_sweep.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setattr(sweep, "sweep_cache_path", lambda: path)
    # El sello de instancia lo cubre test_calibration_fingerprint.
    monkeypatch.setattr(benchmarks, "with_freshness", lambda payload_, db, *, scenario_id: payload_)

    result = benchmarks.get_objective_sweep(MagicMock(), MagicMock())

    assert result["paretoFrontier"] == payload["paretoFrontier"]
    assert set(result["acceptance"]) == {"ac1", "ac2", "ac3"}


def test_objective_sweep_cache_read_404_without_cache(monkeypatch, tmp_path):
    from app.services import multiobjective_sweep_service as sweep

    monkeypatch.setattr(sweep, "sweep_cache_path", lambda: tmp_path / "missing.json")

    with pytest.raises(HTTPException) as excinfo:
        benchmarks.get_objective_sweep(MagicMock(), MagicMock())

    assert excinfo.value.status_code == 404
