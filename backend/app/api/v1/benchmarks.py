"""API de benchmarks de observabilidad."""

from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, PlannerOrAdmin
from app.services.aco_sensitivity_service import load_aco_sensitivity, run_aco_sensitivity
from app.services.benchmark_service import load_aco_benchmark, run_aco_benchmark

router = APIRouter(tags=["benchmarks"])


@router.get("/benchmarks/aco")
def get_aco_benchmark(_: PlannerOrAdmin):
    payload = load_aco_benchmark()
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No hay benchmark ACO generado. Ejecuta: just benchmark-aco",
        )
    return payload


@router.post("/benchmarks/aco")
def generate_aco_benchmark(db: DbSession, _: PlannerOrAdmin):
    return run_aco_benchmark(db)


@router.get("/benchmarks/aco/sensitivity")
def get_aco_sensitivity(_: PlannerOrAdmin):
    payload = load_aco_sensitivity()
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail="No hay estudio de sensibilidad ACO. Ejecuta: just phase3-sensitivity",
        )
    return payload


@router.post("/benchmarks/aco/sensitivity")
def generate_aco_sensitivity(db: DbSession, _: PlannerOrAdmin):
    return run_aco_sensitivity(db)
