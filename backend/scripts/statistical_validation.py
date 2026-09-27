"""Validación estadística Wilcoxon por escenario, reproducible por CLI.

Equivale al endpoint ``POST /api/v1/validations/statistical`` pero sin auth: abre su
propia sesión de BD y escribe ``data/cache/statistical-validations.json`` además de las
filas en la tabla ``statistical_validations``.

Corre en paralelo por semilla con ``--workers`` (por defecto, hasta 8 procesos); usa
``--quick`` para iterar con pocas corridas y deja el N por defecto (30) para el snapshot.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.config import settings
from app.db.session import SessionLocal
from app.domain.scenarios import SCENARIO_ORDER
from app.services.statistical_validation import (
    DEFAULT_N_RUNS,
    run_statistical_validations,
)
from app.services.worker_pool import MAX_DEFAULT_WORKERS, default_workers

# Corridas del atajo de iteración (``--quick``): suficiente para validar la fontanería.
QUICK_N_RUNS = 10


def _output_path() -> Path:
    path = Path(settings.data_dir) / "cache" / "statistical-validations.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Wilcoxon pareado línea base vs optimización por escenario.",
    )
    parser.add_argument(
        "--scenario",
        action="append",
        dest="scenarios",
        default=None,
        help="Escenario a validar (repetible). Por defecto, los 5 del contrato.",
    )
    parser.add_argument(
        "--n-runs",
        type=int,
        default=None,
        help=f"Corridas pareadas por escenario (default {DEFAULT_N_RUNS}).",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help=f"Iteración rápida: {QUICK_N_RUNS} corridas por escenario (ignorado si se pasa --n-runs).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=default_workers(),
        help=f"Procesos en paralelo (default: min(núcleos, {MAX_DEFAULT_WORKERS}) = {default_workers()}); 1 = secuencial.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    scenario_ids = tuple(args.scenarios) if args.scenarios else SCENARIO_ORDER
    n_runs = args.n_runs or (QUICK_N_RUNS if args.quick else DEFAULT_N_RUNS)
    workers = max(1, args.workers)

    with SessionLocal() as db:
        payload = run_statistical_validations(
            db, scenario_ids=scenario_ids, n_runs=n_runs, workers=workers
        )

    path = _output_path()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"✅ Validación estadística: {len(payload['validations'])} escenarios · "
        f"N={n_runs} · {workers} worker(s) en {path}"
    )
    for row in payload["validations"]:
        test = row["wilcoxon"]
        print(
            f"   {row['scenarioId']:16}  "
            f"{row['meanDistanceCurrent']}→{row['meanDistanceOptimized']} km  "
            f"ahorro {row['savingPct']:+.1f}%  "
            f"W={test['statistic']} p={test['pValue']} p_Holm={row['pValueHolm']}  "
            f"r={row['effectSize']['rankBiserial']} dz={row['effectSize']['cohenDz']}"
        )


if __name__ == "__main__":
    main()
