"""Jobs asíncronos de optimización (progreso real en memoria)."""

from __future__ import annotations

import json
import threading
import time as _time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Callable

from app.config import settings
from app.db.models import OptimizationJobRecord
from app.db.session import SessionLocal
from sqlalchemy import func, select
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
    scenario_id: str | None
    rain_intensity: str | None
    waste_level_pct: int | None
    estimated_duration_hours: int | None
    operators_shortage: int | None = None
    aco_ants: int | None = None
    aco_iterations: int | None = None
    priority_fill_level: bool | None = None
    time_window_enabled: bool | None = None
    departure_hour: int | None = None
    kpi_view: str | None = None
    collection_point_ids: list[int] | None = None
    case_study_id: int | None = None
    auto_dispatch: bool = False
    operation_date: date | None = None
    daily_plan_id: int | None = None
    weekly_plan_id: int | None = None
    planning_level: str | None = None
    fleet_limit: int | None = None
    fleet_by_type: dict[str, int] | None = None
    sector_partition: bool | None = None
    job_type: str = "simulation"
    extra_params: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    phase: str | None = None
    progress: int = 0
    logs: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    aco_convergence: list[dict[str, Any]] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)
    _last_persist: float = field(default=0.0, repr=False)


# Campos configurables del motor que se guardan en params_json.
_JOB_PARAM_FIELDS = (
    "scenario_id",
    "rain_intensity",
    "waste_level_pct",
    "estimated_duration_hours",
    "operators_shortage",
    "aco_ants",
    "aco_iterations",
    "priority_fill_level",
    "time_window_enabled",
    "departure_hour",
    "kpi_view",
    "collection_point_ids",
    "case_study_id",
    "auto_dispatch",
    "operation_date",
    "daily_plan_id",
    "weekly_plan_id",
    "planning_level",
    "fleet_limit",
    "fleet_by_type",
    "sector_partition",
)


def _serialize_params(job: OptimizationJob) -> str:
    params: dict[str, Any] = {
        key: getattr(job, key) for key in _JOB_PARAM_FIELDS if getattr(job, key, None) is not None
    }
    params.update(job.extra_params or {})
    return json.dumps(params, ensure_ascii=False, default=str)


def _persist_job_snapshot(job: OptimizationJob, *, force: bool = False) -> None:
    """Persiste hitos del job con throttling (cada ~2 s salvo hitos finales)."""
    now = _time.monotonic()
    if not force and now - job._last_persist < 2.0:
        return
    job._last_persist = now
    try:
        with SessionLocal() as db:
            record = db.get(OptimizationJobRecord, job.id)
            if record is None:
                record = OptimizationJobRecord(id=job.id, created_at=job.created_at or datetime.now(timezone.utc))
                db.add(record)
            record.job_type = job.job_type
            record.status = job.status
            record.phase = job.phase
            record.progress = job.progress
            record.params_json = _serialize_params(job)
            record.result_json = json.dumps(job.result, ensure_ascii=False, default=str) if job.result else None
            record.error = job.error
            record.logs_json = json.dumps(list(job.logs[-50:]), ensure_ascii=False, default=str)
            record.started_at = job.started_at
            record.finished_at = job.finished_at
            db.commit()
    except Exception as exc:  # noqa: BLE001
        print(f"[optimization_job] No se pudo persistir job {job.id}: {exc}", flush=True)


def list_job_records(
    *,
    job_type: str | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Historial persistente de jobs (Tarea 8)."""
    stmt = select(OptimizationJobRecord)
    count_stmt = select(func.count()).select_from(OptimizationJobRecord)
    if job_type:
        stmt = stmt.where(OptimizationJobRecord.job_type == job_type)
        count_stmt = count_stmt.where(OptimizationJobRecord.job_type == job_type)
    if status:
        stmt = stmt.where(OptimizationJobRecord.status == status)
        count_stmt = count_stmt.where(OptimizationJobRecord.status == status)
    with SessionLocal() as db:
        rows = db.scalars(
            stmt.order_by(OptimizationJobRecord.created_at.desc()).offset(offset).limit(limit)
        ).all()
        total = db.scalar(count_stmt) or 0
        return {
            "items": [
                {
                    "id": row.id,
                    "jobType": row.job_type,
                    "status": row.status,
                    "phase": row.phase,
                    "progress": row.progress,
                    "createdAt": row.created_at.isoformat() if row.created_at else None,
                    "startedAt": row.started_at.isoformat() if row.started_at else None,
                    "finishedAt": row.finished_at.isoformat() if row.finished_at else None,
                    "error": row.error,
                }
                for row in rows
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }


def recover_orphan_jobs() -> int:
    """Marca jobs pendientes/en ejecución de sesiones anteriores como fallidos."""
    recovered = 0
    with SessionLocal() as db:
        rows = db.scalars(
            select(OptimizationJobRecord).where(OptimizationJobRecord.status.in_(("pending", "running")))
        ).all()
        for row in rows:
            if row.status not in {"pending", "running"}:
                continue
            row.status = "failed"
            row.error = "Interrumpido por reinicio del servidor"
            row.finished_at = datetime.now(timezone.utc)
            recovered += 1
        db.commit()
    return recovered


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
        _persist_job_snapshot(self._job)

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
        _persist_job_snapshot(self._job)


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
    scenario_id: str | None = None,
    rain_intensity: str | None = None,
    waste_level_pct: int | None = None,
    estimated_duration_hours: int | None = None,
    operators_shortage: int | None = None,
    aco_ants: int | None = None,
    aco_iterations: int | None = None,
    priority_fill_level: bool | None = None,
    time_window_enabled: bool | None = None,
    departure_hour: int | None = None,
    kpi_view: str | None = None,
    collection_point_ids: list[int] | None = None,
    case_study_id: int | None = None,
    auto_dispatch: bool | None = None,
    operation_date: date | None = None,
    daily_plan_id: int | None = None,
    weekly_plan_id: int | None = None,
    planning_level: str | None = None,
    fleet_limit: int | None = None,
    fleet_by_type: dict[str, int] | None = None,
    sector_partition: bool | None = None,
    job_type: str | None = None,
) -> OptimizationJob:
    resolved_auto_dispatch = auto_dispatch
    if resolved_auto_dispatch is None:
        resolved_auto_dispatch = planning_level == "operational"
    if job_type is None:
        job_type = "planning" if planning_level in {"operational", "administrative"} else "simulation"
    created_at = datetime.now(timezone.utc)
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
        priority_fill_level=priority_fill_level,
        time_window_enabled=time_window_enabled,
        departure_hour=departure_hour,
        kpi_view=kpi_view,
        collection_point_ids=collection_point_ids,
        case_study_id=case_study_id,
        auto_dispatch=resolved_auto_dispatch,
        operation_date=operation_date,
        daily_plan_id=daily_plan_id,
        weekly_plan_id=weekly_plan_id,
        planning_level=planning_level,
        fleet_limit=fleet_limit,
        fleet_by_type=fleet_by_type,
        sector_partition=sector_partition,
        job_type=job_type,
        created_at=created_at,
    )
    with _jobs_lock:
        _jobs[job.id] = job
    _persist_job_snapshot(job, force=True)
    thread = threading.Thread(target=_run_job_worker, args=(job.id,), daemon=True)
    thread.start()
    return job


def start_background_job(job: OptimizationJob, runner: Callable[[Any], dict[str, Any]]) -> OptimizationJob:
    """Ejecuta un runner (p. ej. contingencia) en worker propio sin bloquear el request."""
    with _jobs_lock:
        _jobs[job.id] = job
    _persist_job_snapshot(job, force=True)
    thread = threading.Thread(target=_run_background_worker, args=(job.id, runner), daemon=True)
    thread.start()
    return job


def run_contingency_background(
    *,
    job_type: str,
    scenario_id: str,
    params: dict[str, Any],
    runner: Callable[[Any], dict[str, Any]],
) -> OptimizationJob:
    """Crea y arranca un job asíncrono de contingencia (Tarea 8)."""
    job = OptimizationJob(
        id=str(uuid.uuid4()),
        status="pending",
        scenario_id=scenario_id,
        rain_intensity=None,
        waste_level_pct=None,
        estimated_duration_hours=None,
        job_type=job_type,
        planning_level="operational",
        auto_dispatch=True,
        extra_params=params,
        created_at=datetime.now(timezone.utc),
    )
    return start_background_job(job, runner)


def _run_background_worker(job_id: str, runner: Callable[[Any], dict[str, Any]]) -> None:
    job = get_optimization_job(job_id)
    if job is None:
        return
    with job.lock:
        job.status = "running"
        job.phase = "ejecutando"
        job.progress = 10
        job.started_at = job.started_at or datetime.now(timezone.utc)
    _persist_job_snapshot(job, force=True)
    db = SessionLocal()
    try:
        result = runner(db)
        with job.lock:
            job.status = "completed"
            job.phase = "persistencia"
            job.progress = 100
            job.finished_at = datetime.now(timezone.utc)
            job.result = result
        _persist_job_snapshot(job, force=True)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        import traceback as _tb

        print(f"[optimization_job] Job {job_id} FAILED: {exc}\n{_tb.format_exc()}", flush=True)
        with job.lock:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = datetime.now(timezone.utc)
        _persist_job_snapshot(job, force=True)
    finally:
        db.close()


def count_jobs_by_status() -> dict[str, int]:
    """Conteo de jobs en memoria por estado (para métricas de observabilidad)."""
    with _jobs_lock:
        jobs = list(_jobs.values())
    counts: dict[str, int] = {}
    for job in jobs:
        counts[job.status] = counts.get(job.status, 0) + 1
    return counts


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
            job.started_at = job.started_at or datetime.now(timezone.utc)
        _persist_job_snapshot(job, force=True)

        result = run_optimization_engine(
            db,
            job.scenario_id,
            rain_intensity=job.rain_intensity,
            waste_level_pct=job.waste_level_pct,
            estimated_duration_hours=job.estimated_duration_hours,
            operators_shortage=job.operators_shortage,
            aco_ants=job.aco_ants,
            aco_iterations=job.aco_iterations,
            priority_fill_level=job.priority_fill_level,
            time_window_enabled=job.time_window_enabled,
            departure_hour=job.departure_hour,
            kpi_view=job.kpi_view,
            collection_point_ids=job.collection_point_ids,
            case_study_id=job.case_study_id,
            auto_dispatch=job.auto_dispatch,
            operation_date=job.operation_date,
            daily_plan_id=job.daily_plan_id,
            weekly_plan_id=job.weekly_plan_id,
            planning_level=job.planning_level,
            fleet_limit=job.fleet_limit,
            fleet_by_type=job.fleet_by_type,
            sector_partition=job.sector_partition,
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
            job.finished_at = datetime.now(timezone.utc)
        _persist_job_snapshot(job, force=True)
    except OptimizationCancelledError:
        db.rollback()
        with job.lock:
            job.status = "cancelled"
            job.finished_at = datetime.now(timezone.utc)
        _persist_job_snapshot(job, force=True)
    except Exception as exc:  # noqa: BLE001
        import traceback as _tb
        print(f"[optimization_job] Job {job_id} FAILED: {exc}\n{_tb.format_exc()}", flush=True)
        db.rollback()
        with job.lock:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = datetime.now(timezone.utc)
        _persist_job_snapshot(job, force=True)
    finally:
        db.close()
        slot.release()


def start_weekly_operational_plan_job(weekly_plan_id: int) -> OptimizationJob:
    """Lanza la generación del plan operativo semanal (optimiza Lun→Vie en secuencia)."""
    from app.services.weekly_operational_service import generate_weekly_operational_plan

    job = OptimizationJob(
        id=str(uuid.uuid4()),
        status="pending",
        scenario_id=None,
        rain_intensity=None,
        waste_level_pct=None,
        estimated_duration_hours=None,
        operators_shortage=None,
        job_type="weekly_operational_plan",
        planning_level="administrative",
        extra_params={"weeklyPlanId": weekly_plan_id},
        created_at=datetime.now(timezone.utc),
    )

    def update_progress(message: str, value: int) -> None:
        with job.lock:
            if job.status not in ("pending", "running"):
                job.status = "running"
            job.phase = message
            job.progress = value
        _persist_job_snapshot(job)

    def runner(db: Session) -> dict[str, Any]:
        with job.lock:
            job.status = "running"
            job.phase = "Preparando plan operativo…"
            job.progress = 1
        _persist_job_snapshot(job)
        # Respeta el semáforo global de un solo motor: espera si hay otro ACO corriendo.
        slot = _get_optimization_slot()
        acquired = False
        try:
            acquired = _acquire_optimization_slot(job)
            if not acquired:
                return {"weeklyPlanId": weekly_plan_id, "cancelled": True}
            return generate_weekly_operational_plan(
                db,
                weekly_plan_id,
                on_progress=update_progress,
            )
        finally:
            if acquired:
                slot.release()

    return start_background_job(job, runner)
