import threading
import time
from unittest.mock import MagicMock

import pytest

from app.services.optimization_job_service import (
    cancel_optimization_job,
    create_optimization_job,
    get_optimization_job_view,
)


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
    assert view["phase"] == "listo"
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
