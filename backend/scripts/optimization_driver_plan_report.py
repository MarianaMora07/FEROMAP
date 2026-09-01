"""Optimización real + tabla legible de planes por conductor (smoke / defensa)."""

from __future__ import annotations

import argparse
import sys

from app.db.session import SessionLocal
from app.services.case_study_optimization import get_case_study_by_code
from app.services.optimization_report_service import (
    build_optimization_report,
    fetch_driver_routes_for_simulation,
)
from app.services.optimization_service import run_optimization_engine


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Corre el motor de optimización y muestra planes por conductor.",
    )
    parser.add_argument(
        "scenario",
        nargs="?",
        default=None,
        help="Escenario operativo (normal, rain, …). Opcional si se usa --case-study.",
    )
    parser.add_argument(
        "--case-study",
        dest="case_study_code",
        metavar="CODE",
        help="Código del caso de estudio (p. ej. CE-UNARE-NORTE).",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    with SessionLocal() as db:
        try:
            case_study_id: int | None = None
            if args.case_study_code:
                study = get_case_study_by_code(db, args.case_study_code)
                case_study_id = study.id

            result = run_optimization_engine(
                db,
                args.scenario,
                case_study_id=case_study_id,
                aco_ants=12,
                aco_iterations=20,
                auto_commit=False,
                auto_dispatch=False,
                reporter=None,
            )
            routes = fetch_driver_routes_for_simulation(db, result["simulationId"])
            report = build_optimization_report(result, routes)
            print(report.markdown)
            db.rollback()
            return 0
        except Exception as exc:
            db.rollback()
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
