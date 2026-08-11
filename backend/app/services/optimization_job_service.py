"""Jobs asíncronos de optimización (progreso real en memoria)."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.db.session import SessionLocal
from app.services.optimization_service import OptimizationCancelledError, run_optimization_engine

PHASE_END_PROGRESS: dict[str, int] = {
    "preparando": 5,
    "grafo_vial": 15,
    "matriz_costos": 30,
    "instancia_vrp": 40,
    "aco": 75,
    "refinamiento_2opt": 90,
    "persistencia": 98,
    "listo": 100,
}


@dataclass
class OptimizationJob:
    id: str
    status: str
    scenario_id: str
    rain_intensity: str | None
    waste_level_pct: int | None
    estimated_duration_hours: int | None
    operators_shortage: int | None = None
    phase: str | None = None
    progress: int = 0
    logs: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)


class JobProgressReporter:
    """Puente entre el motor VRP y el estado del job."""

    def __init__(self, job: OptimizationJob) -> None:
        self._job = job

    def cancelled(self) -> bool:
        return self._job.cancel_requested

    def check_cancelled(self) -> None:
        if self._job.cancel_requested:
            raise OptimizationCancelledError()

    def advance(self, phase: str, message: str, log_type: str = "info") -> None:
        self.check_cancelled()
        with self._job.lock:
            self._job.phase = phase
            self._job.progress = PHASE_END_PROGRESS.get(phase, self._job.progress)
            self._job.logs.append(
                {
                    "id": f"log-{self._job.id}-{len(self._job.logs)}",
                    "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                    "message": message,
                    "type": log_type,
                    "phaseId": phase,
                }
            )

    def set_aco_progress(self, iteration: int, total: int) -> None:
        self.check_cancelled()
        start = PHASE_END_PROGRESS["instancia_vrp"]
        end = PHASE_END_PROGRESS["aco"]
        span = max(end - start, 1)
        progress = start + int(span * (iteration / max(total, 1)))
        with self._job.lock:
            self._job.phase = "aco"
            self._job.progress = min(end, progress)


_jobs: dict[str, OptimizationJob] = {}
_jobs_lock = threading.Lock()


def _serialize_job(job: OptimizationJob) -> dict[str, Any]:
    with job.lock:
        return {
            "jobId": job.id,
            "status": job.status,
            "phase": job.phase,
            "progress": job.progress,
            "logs": list(job.logs),
            "result": job.result,
            "error": job.error,
        }


def create_optimization_job(
    *,
    scenario_id: str,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    estimated_duration_hours: int | None = None,
    operators_shortage: int | None = None,
) -> OptimizationJob:
    job = OptimizationJob(
        id=str(uuid.uuid4()),
        status="pending",
        scenario_id=scenario_id,
        rain_intensity=rain_intensity,
        waste_level_pct=waste_level_pct,
        estimated_duration_hours=estimated_duration_hours,
        operators_shortage=operators_shortage,
    )
    with _jobs_lock:
        _jobs[job.id] = job
    thread = threading.Thread(target=_run_job_worker, args=(job.id,), daemon=True)
    thread.start()
    return job


def get_optimization_job(job_id: str) -> OptimizationJob | None:
    with _jobs_lock:
        return _jobs.get(job_id)


def get_optimization_job_view(job_id: str) -> dict[str, Any]:
    job = get_optimization_job(job_id)
    if job is None:
        raise LookupError("Job no encontrado")
    return _serialize_job(job)


def cancel_optimization_job(job_id: str) -> dict[str, Any]:
    job = get_optimization_job(job_id)
    if job is None:
        raise LookupError("Job no encontrado")
    with job.lock:
        if job.status in {"completed", "cancelled", "failed"}:
            return {"jobId": job.id, "status": job.status}
        job.cancel_requested = True
        if job.status == "pending":
            job.status = "cancelled"
            job.phase = job.phase or "preparando"
    return {"jobId": job.id, "status": "cancelled"}


def _run_job_worker(job_id: str) -> None:
    job = get_optimization_job(job_id)
    if job is None:
        return

    with job.lock:
        job.status = "running"
        job.phase = "preparando"
        job.progress = 0

    db = SessionLocal()
    reporter = JobProgressReporter(job)
    try:
        result = run_optimization_engine(
            db,
            job.scenario_id,
            rain_intensity=job.rain_intensity,
            waste_level_pct=job.waste_level_pct,
            estimated_duration_hours=job.estimated_duration_hours,
            operators_shortage=job.operators_shortage,
            reporter=reporter,
        )
        with job.lock:
            if job.cancel_requested:
                db.rollback()
                job.status = "cancelled"
            else:
                job.status = "completed"
                job.phase = "listo"
                job.progress = 100
                result["logs"] = list(job.logs)
                job.result = result
    except OptimizationCancelledError:
        db.rollback()
        with job.lock:
            job.status = "cancelled"
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        with job.lock:
            job.status = "failed"
            job.error = str(exc)
    finally:
        db.close()
