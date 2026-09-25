"""CLI: KPIs de referencia Fase 0 (5 escenarios) → data/cache/phase0-baseline-metrics.json.

La implementación vive en ``app.services.thesis_evidence_service`` para que el CLI y la vista
de calibración compartan una sola ruta de cálculo y la misma caché.

Corre los escenarios en paralelo por proceso (``--workers``); cada proceso hace una corrida de
calentamiento descartada y una medida, para que ``computationSeconds`` refleje el motor en
régimen caliente y no el arranque en frío.
"""

from __future__ import annotations

import argparse

from app.db.session import SessionLocal
from app.services.thesis_evidence_service import (
    DEFAULT_BASELINE_ANTS,
    DEFAULT_BASELINE_ITERATIONS,
    run_baseline_evidence,
    thesis_evidence_path,
)
from app.services.worker_pool import default_workers


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="KPIs de referencia Fase 0 (5 escenarios, perfil ACO estándar).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=default_workers(),
        help=f"Procesos en paralelo (default: {default_workers()}); 1 = secuencial.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    with SessionLocal() as db:
        payload = run_baseline_evidence(
            db,
            aco_ants=DEFAULT_BASELINE_ANTS,
            aco_iterations=DEFAULT_BASELINE_ITERATIONS,
            workers=max(1, args.workers),
        )
    path = thesis_evidence_path("baseline")
    print(f"✅ Fase 0 baseline: {len(payload['runs'])} escenarios en {path}")
    for run in payload["runs"]:
        dist = run["distanceKm"]
        print(
            f"   {run['scenarioId']:16}  "
            f"{dist['current']}→{dist['optimized']} km  "
            f"ahorro {run['savingPct']:+.1f}%  "
            f"no cubiertos {run['uncoveredPoints']}  "
            f"cómputo {run['computationSeconds']} s"
        )


if __name__ == "__main__":
    main()
