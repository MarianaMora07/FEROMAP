"""Genera estudio de sensibilidad ACO (Fase 3) → fila en `calibration_sweeps`."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.services.aco_sensitivity_service import run_aco_sensitivity
from app.services.instance_fingerprint import current_fingerprint


def main() -> None:
    with SessionLocal() as db:
        payload = run_aco_sensitivity(
            db, instance_fingerprint=current_fingerprint(db, scenario_id="normal")
        )
    ok = sum(1 for run in payload["runs"] if "error" not in run)
    print(f"✅ Sensibilidad ACO: {ok}/{len(payload['runs'])} corridas en {payload['durationSeconds']} s")
    print(f"   Sello de instancia: {payload['instanceFingerprint']}")
    print("   Guardado en la tabla calibration_sweeps (barrido 'sensitivity')")
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
