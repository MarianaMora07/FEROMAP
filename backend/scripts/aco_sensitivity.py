"""Genera estudio de sensibilidad ACO (Fase 3) → data/cache/phase3/aco_sensitivity.json."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.services.aco_sensitivity_service import run_aco_sensitivity


def main() -> None:
    with SessionLocal() as db:
        payload = run_aco_sensitivity(db)
    ok = sum(1 for run in payload["runs"] if "error" not in run)
    print(f"✅ Sensibilidad ACO: {ok}/{len(payload['runs'])} corridas en {payload['durationSeconds']} s")
    print("   Guardado en data/cache/phase3/aco_sensitivity.json")
    for run in payload["runs"]:
        if "error" in run:
            print(f"   ✗ {run['label']}: {run['error']}")
            continue
        print(
            f"   {run['label']:28}  "
            f"{run['distanceKmOptimized']} km  "
            f"{run['computationSeconds']} s  "
            f"iter={run['acoIterationsRun']}"
        )


if __name__ == "__main__":
    main()
