"""Reporte markdown de un caso de estudio (Fase 12.7)."""

from __future__ import annotations

import argparse
import sys

from app.db.session import SessionLocal
from app.services.case_study_evidence_service import build_case_study_report_markdown


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Optimización ACO acotada a un caso de estudio + planes por conductor.",
    )
    parser.add_argument(
        "case_study_code",
        help="Código del caso (p. ej. CE-UNARE-NORTE).",
    )
    parser.add_argument(
        "--scenario",
        default=None,
        help="Escenario operativo (default: el del caso).",
    )
    parser.add_argument(
        "--single-day",
        action="store_true",
        help="Forzar optimización de un solo día (sin reparto semanal).",
    )
    parser.add_argument(
        "--planning",
        action="store_true",
        help="Forzar modo planificación semanal (reparto + pendientes).",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    with SessionLocal() as db:
        try:
            print(
                build_case_study_report_markdown(
                    db,
                    args.case_study_code,
                    scenario_id=args.scenario,
                    planning_mode=True if args.planning else False if args.single_day else None,
                )
            )
            db.rollback()
            return 0
        except Exception as exc:
            db.rollback()
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
