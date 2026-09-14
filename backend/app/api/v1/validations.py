"""API de validación estadística."""

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DbSession, PlannerOrAdmin
from app.services.statistical_validation import (
    get_validation,
    list_validations,
    run_statistical_validation,
)

router = APIRouter(tags=["validations"])


@router.post("/validations/statistical")
def run_validation(db: DbSession, _: PlannerOrAdmin, scenarioId: str = Query(default="normal"), nRuns: int = Query(default=30, ge=5, le=100)):
    try:
        result = run_statistical_validation(db, scenario_id=scenarioId, n_runs=nRuns)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "validationId": None,
        "scenarioId": result.scenario_id,
        "nRuns": result.n_runs,
        "meanDistanceCurrent": result.mean_current,
        "meanDistanceOptimized": result.mean_optimized,
        "savingPct": result.saving_pct,
        "stdDistanceOptimized": result.std_optimized,
        "wilcoxon": {
            "statistic": result.wilcoxon_statistic,
            "pValue": result.wilcoxon_p_value,
        },
        "confidenceInterval": {
            "lower": result.ci_lower,
            "upper": result.ci_upper,
        },
        "isSignificant": result.is_significant,
        "runs": result.runs,
    }


@router.get("/validations/statistical")
def get_validations(db: DbSession, _: PlannerOrAdmin, limit: int = Query(default=50, ge=1, le=200)):
    return list_validations(db, limit=limit)


@router.get("/validations/statistical/{validation_id}")
def get_validation_detail(db: DbSession, _: PlannerOrAdmin, validation_id: int):
    result = get_validation(db, validation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Validación no encontrada")
    return result
