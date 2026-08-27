"""Genera KPIs de referencia Fase 0: 3 escenarios × perfil ACO estándar."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.db.session import SessionLocal
from app.services.optimization_service import run_optimization_engine

PHASE0_SCENARIOS = ("normal", "rain", "saturated")
DEFAULT_ANTS = 12
DEFAULT_ITERATIONS = 20


def _output_path() -> Path:
    path = Path(settings.data_dir) / "cache" / "phase0-baseline-metrics.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def run_phase0_baseline(
    *,
    aco_ants: int = DEFAULT_ANTS,
    aco_iterations: int = DEFAULT_ITERATIONS,
) -> dict:
    runs: list[dict] = []
    with SessionLocal() as db:
        for scenario_id in PHASE0_SCENARIOS:
            result = run_optimization_engine(
                db,
                scenario_id,
                aco_ants=aco_ants,
                aco_iterations=aco_iterations,
                auto_commit=False,
                auto_dispatch=False,
                reporter=None,
            )
            db.rollback()
            kpis = result["kpis"]
            metrics = kpis.get("engineMetrics") or {}
            current_km = kpis["distanceKm"]["current"]
            optimized_km = kpis["distanceKm"]["optimized"]
            saving_pct = (
                round((1 - optimized_km / current_km) * 100, 1) if current_km > 0 else 0.0
            )
            runs.append(
                {
                    "scenarioId": scenario_id,
                    "distanceKm": kpis["distanceKm"],
                    "durationHours": kpis["durationHours"],
                    "uncoveredPoints": kpis.get("uncoveredPoints", 0),
                    "uncoveredPointCodes": kpis.get("uncoveredPointCodes", []),
                    "co2KgAvoided": kpis.get("co2KgAvoided", 0),
                    "fuelLiters": kpis.get("fuelLiters", {}),
                    "coveragePct": kpis.get("coveragePct", {}),
                    "containersServed": kpis.get("containersServed", 0),
                    "landfillTrips": kpis.get("landfillTrips", 0),
                    "computationSeconds": round(metrics.get("computationSeconds", 0), 1),
                    "savingPct": saving_pct,
                }
            )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "acoProfile": {"ants": aco_ants, "iterations": aco_iterations},
        "scenarioIds": list(PHASE0_SCENARIOS),
        "runs": runs,
    }


def main() -> None:
    payload = run_phase0_baseline()
    path = _output_path()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Fase 0 baseline: {len(payload['runs'])} escenarios en {path}")
    for run in payload["runs"]:
        dist = run["distanceKm"]
        print(
            f"   {run['scenarioId']:10}  "
            f"{dist['current']}→{dist['optimized']} km  "
            f"ahorro {run['savingPct']:+.1f}%  "
            f"no cubiertos {run['uncoveredPoints']}"
        )


if __name__ == "__main__":
    main()
