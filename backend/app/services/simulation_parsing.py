from __future__ import annotations

import json
from typing import Any

from app.db.models import Simulation


def _case_study_fields(sim: Simulation, params: dict[str, Any]) -> dict[str, Any]:
    case_payload = (params.get("simulationParameters") or {}).get("caseStudy") or {}
    case_study_id = sim.case_study_id
    return {
        "caseStudyId": case_study_id,
        "caseStudyCode": case_payload.get("caseStudyCode"),
        "caseStudyName": case_payload.get("caseStudyName"),
    }


def parse_simulation(sim: Simulation) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if sim.parameters_json:
        params = json.loads(sim.parameters_json)
    kpis = params.get("kpis") or {}
    return {
        "id": sim.id,
        "executedAt": sim.executed_at.isoformat() if sim.executed_at else None,
        "scenarioName": sim.scenario_name,
        "scenarioId": params.get("scenarioId", "normal"),
        "distanceHistoricalKm": float(sim.kpi_total_distance_historical or 0),
        "distanceOptimizedKm": float(sim.kpi_total_distance_optimized or 0),
        "savingPercentage": float(sim.kpi_saving_percentage or 0),
        "containersServed": kpis.get("containersServed", 0),
        "fuelLitersOptimized": (kpis.get("fuelLiters") or {}).get("optimized", 0),
        "contingency": bool(params.get("contingency")),
        **_case_study_fields(sim, params),
    }
