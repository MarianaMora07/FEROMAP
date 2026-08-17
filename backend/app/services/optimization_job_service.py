"""Jobs asíncronos de optimización (progreso real en memoria)."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

from app.config import settings
from app.db.session import SessionLocal
from app.services.optimization_service import OptimizationCancelledError, run_optimization_engine

PHASE_END_PROGRESS: dict[str, int] = {
    "preparando": 5,
    "grafo_vial": 15,
    "matriz_costos": 30,
    "instancia_vrp": 40,
    "aco": 75,
    "refinamiento_2opt": 88,
    "persistencia": 95,
}

_optimization_slot: threading.Semaphore | None = None
_slot_init_lock = threading.Lock()


def _get_optimization_slot() -> threading.Semaphore:
    global _optimization_slot
    with _slot_init_lock:
        if _optimization_slot is None:
            _optimization_slot = threading.Semaphore(max(1, settings.optimization_max_workers))
        return _optimization_slot


def reset_optimization_slot_for_tests(max_workers: int | None = None) -> None:
    """Reinicia el semáforo global (solo tests)."""
    global _optimization_slot
    with _slot_init_lock:
        workers = max_workers if max_workers is not None else settings.optimization_max_workers
        _optimization_slot = threading.Semaphore(max(1, workers))


@dataclass
class OptimizationJob:
    id: str
    status: str
    scenario_id: str
    rain_intensity: str | None
    waste_level_pct: int | None
    estimated_duration_hours: int | None
    operators_shortage: int | None = None
    aco_ants: int | None = None
    aco_iterations: int | None = None
    collection_point_ids: list[int] | None = None
    auto_dispatch: bool = False
    operation_date: date | None = None
    daily_plan_id: int | None = None
    weekly_plan_id: int | None = None
    planning_level: str | None = None
    fleet_limit: int | None = None
    phase: str | None = None
    progress: int = 0
    logs: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    aco_convergence: list[dict[str, Any]] = field(default_factory=list)
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

    def set_aco_progress(
        self,
        iteration: int,
        total: int,
        *,
        best_cost_m: float = 0.0,
        iteration_best_m: float = 0.0,
    ) -> None:
        self.check_cancelled()
        start = PHASE_END_PROGRESS["instancia_vrp"]
        end = PHASE_END_PROGRESS["aco"]
        span = max(end - start, 1)
        progress = start + int(span * (iteration / max(total, 1)))
        point = {
            "iteration": iteration,
            "bestDistanceKm": round(best_cost_m / 1000, 3),
            "iterationBestDistanceKm": round(iteration_best_m / 1000, 3),
        }
        with self._job.lock:
            self._job.phase = "aco"
            self._job.progress = min(end, progress)
            if not self._job.aco_convergence or self._job.aco_convergence[-1]["iteration"] != iteration:
                self._job.aco_convergence.append(point)
            else:
                self._job.aco_convergence[-1] = point


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
            "acoConvergence": list(job.aco_convergence),
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
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
    collection_point_ids: list[int] | None = None,
    auto_dispatch: bool | None = None,
    operation_date: date | None = None,
    daily_plan_id: int | None = None,
    weekly_plan_id: int | None = None,
    planning_level: str | None = None,
    fleet_limit: int | None = None,
) -> OptimizationJob:
    resolved_auto_dispatch = auto_dispatch
    if resolved_auto_dispatch is None:
        resolved_auto_dispatch = planning_level == "operational"
    job = OptimizationJob(
        id=str(uuid.uuid4()),
        status="pending",
        scenario_id=scenario_id,
        rain_intensity=rain_intensity,
        waste_level_pct=waste_level_pct,
        estimated_duration_hours=estimated_duration_hours,
        operators_shortage=operators_shortage,
        aco_ants=aco_ants,
        aco_iterations=aco_iterations,
        collection_point_ids=collection_point_ids,
        auto_dispatch=resolved_auto_dispatch,
        operation_date=operation_date,
        daily_plan_id=daily_plan_id,
        weekly_plan_id=weekly_plan_id,
        planning_level=planning_level,
        fleet_limit=fleet_limit,
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


def _acquire_optimization_slot(job: OptimizationJob) -> bool:
    slot = _get_optimization_slot()
    acquired = False
    try:
        while not acquired:
            with job.lock:
                if job.cancel_requested:
                    job.status = "cancelled"
                    return False
            acquired = slot.acquire(timeout=0.25)
        with job.lock:
            if job.cancel_requested:
                job.status = "cancelled"
                return False
        return True
    except Exception:
        if acquired:
            slot.release()
        raise


def _run_job_worker(job_id: str) -> None:
    job = get_optimization_job(job_id)
    if job is None:
        return

    if not _acquire_optimization_slot(job):
        return

    slot = _get_optimization_slot()
    db = SessionLocal()
    reporter = JobProgressReporter(job)
    try:
        with job.lock:
            job.status = "running"
            job.phase = "preparando"
            job.progress = 0

        result = run_optimization_engine(
            db,
            job.scenario_id,
            rain_intensity=job.rain_intensity,
            waste_level_pct=job.waste_level_pct,
            estimated_duration_hours=job.estimated_duration_hours,
            operators_shortage=job.operators_shortage,
            aco_ants=job.aco_ants,
            aco_iterations=job.aco_iterations,
            collection_point_ids=job.collection_point_ids,
            auto_dispatch=job.auto_dispatch,
            operation_date=job.operation_date,
            daily_plan_id=job.daily_plan_id,
            weekly_plan_id=job.weekly_plan_id,
            planning_level=job.planning_level,
            fleet_limit=job.fleet_limit,
            reporter=reporter,
        )
        with job.lock:
            if job.cancel_requested:
                db.rollback()
                job.status = "cancelled"
            else:
                job.status = "completed"
                job.phase = "persistencia"
                job.progress = 100
                result["logs"] = list(job.logs)
                job.result = result
    except OptimizationCancelledError:
        db.rollback()
        with job.lock:
            job.status = "cancelled"
    except Exception as exc:  # noqa: BLE001
        import traceback as _tb
        print(f"[optimization_job] Job {job_id} FAILED: {exc}\n{_tb.format_exc()}", flush=True)
        db.rollback()
        with job.lock:
            job.status = "failed"
            job.error = str(exc)
    finally:
        db.close()
        slot.release()
