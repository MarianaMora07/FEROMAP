import threading
import time
from unittest.mock import MagicMock

import pytest

from app.services.optimization_job_service import (
    cancel_optimization_job,
    create_optimization_job,
    get_optimization_job_view,
    reset_optimization_slot_for_tests,
)


@pytest.fixture(autouse=True)
def reset_job_slot():
    reset_optimization_slot_for_tests(2)
    yield
    reset_optimization_slot_for_tests(2)


@pytest.fixture(autouse=True)
def fast_job_sleep(monkeypatch):
    monkeypatch.setattr(time, "sleep", lambda *_args, **_kwargs: None)


def wait_for_job_status(job_id: str, expected: set[str], timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    view = get_optimization_job_view(job_id)
    while view["status"] not in expected and time.time() < deadline:
        time.sleep(0.02)
        view = get_optimization_job_view(job_id)
    return view


def test_optimization_job_completes_with_progress(monkeypatch):
    def fake_engine(db, scenario_id, **kwargs):
        reporter = kwargs.get("reporter")
        assert reporter is not None
        reporter.advance("preparando", "Inicio")
        reporter.advance("aco", "ACO", "progress")
        reporter.advance("listo", "Listo", "success")
        return {
            "simulationId": 99,
            "scenarioId": scenario_id,
            "kpis": {"distanceKm": {"current": 10, "optimized": 7}},
            "routes": {
                "current": {"type": "FeatureCollection", "features": []},
                "optimized": {"type": "FeatureCollection", "features": []},
            },
            "logs": [],
        }

    monkeypatch.setattr(
        "app.services.optimization_job_service.run_optimization_engine",
        fake_engine,
    )
    monkeypatch.setattr(
        "app.services.optimization_job_service.SessionLocal",
        lambda: MagicMock(),
    )

    job = create_optimization_job(scenario_id="normal")
    view = wait_for_job_status(job.id, {"completed", "failed", "cancelled"})

    assert view["status"] == "completed"
    assert view["phase"] == "persistencia"
    assert view["progress"] == 100
    assert view["result"]["simulationId"] == 99
    assert len(view["logs"]) >= 3
    assert view["logs"][0]["phaseId"] == "preparando"


def test_optimization_job_cancel(monkeypatch):
    engine_started = threading.Event()
    unblock_engine = threading.Event()

    def blocking_engine(db, scenario_id, **kwargs):
        reporter = kwargs.get("reporter")
        reporter.advance("preparando", "Inicio")
        engine_started.set()
        unblock_engine.wait(timeout=5)
        reporter.check_cancelled()
        return {"simulationId": 1, "logs": []}

    monkeypatch.setattr(
        "app.services.optimization_job_service.run_optimization_engine",
        blocking_engine,
    )
    monkeypatch.setattr(
        "app.services.optimization_job_service.SessionLocal",
        lambda: MagicMock(),
    )

    job = create_optimization_job(scenario_id="normal")
    assert engine_started.wait(timeout=5)

    response = cancel_optimization_job(job.id)
    assert response["status"] == "cancelled"

    unblock_engine.set()
    view = wait_for_job_status(job.id, {"cancelled", "completed", "failed"})

    assert view["status"] == "cancelled"


def test_optimization_jobs_limited_by_max_workers(monkeypatch):
    reset_optimization_slot_for_tests(1)
    running = threading.Event()
    release = threading.Event()
    active = 0
    peak = 0
    lock = threading.Lock()

    def blocking_engine(db, scenario_id, **kwargs):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        running.set()
        release.wait(timeout=5)
        with lock:
            active -= 1
        return {
            "simulationId": 1,
            "scenarioId": scenario_id,
            "kpis": {},
            "routes": {
                "current": {"type": "FeatureCollection", "features": []},
                "optimized": {"type": "FeatureCollection", "features": []},
            },
            "logs": [],
        }

    monkeypatch.setattr(
        "app.services.optimization_job_service.run_optimization_engine",
        blocking_engine,
    )
    monkeypatch.setattr(
        "app.services.optimization_job_service.SessionLocal",
        lambda: MagicMock(),
    )

    job_a = create_optimization_job(scenario_id="normal")
    assert running.wait(timeout=5)
    job_b = create_optimization_job(scenario_id="normal")

    deadline = time.time() + 2
    while time.time() < deadline:
        view_b = get_optimization_job_view(job_b.id)
        if view_b["status"] == "running":
            break
        time.sleep(0.02)

    view_b = get_optimization_job_view(job_b.id)
    assert view_b["status"] == "pending"
    assert peak == 1

    release.set()
    wait_for_job_status(job_a.id, {"completed", "failed", "cancelled"})
    wait_for_job_status(job_b.id, {"completed", "failed", "cancelled"})
    assert get_optimization_job_view(job_b.id)["status"] == "completed"
