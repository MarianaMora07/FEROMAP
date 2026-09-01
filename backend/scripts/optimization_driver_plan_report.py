"""Optimización real + tabla legible de planes por conductor (smoke / defensa)."""

from __future__ import annotations

import sys

from app.db.session import SessionLocal
from app.services.optimization_report_service import (
    build_optimization_report,
    fetch_driver_routes_for_simulation,
)
from app.services.optimization_service import run_optimization_engine


def main() -> int:
    scenario_id = sys.argv[1] if len(sys.argv) > 1 else "normal"
    with SessionLocal() as db:
        try:
            result = run_optimization_engine(
                db,
                scenario_id,
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
