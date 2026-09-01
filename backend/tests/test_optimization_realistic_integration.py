"""Integración real: motor ACO + KPIs plausibles + planes por conductor.

Requiere PostgreSQL con seed (just seed). Sin BD → skip.
Ejecutar reporte legible: just optimization-driver-report
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.optimization_report_service import (
    assess_convergence,
    build_optimization_report,
    fetch_driver_routes_for_simulation,
    is_plausible_daily_optimization_kpis,
)
from app.services.optimization_service import run_optimization_engine


def _database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible"),
]


def test_realistic_optimization_converges_and_builds_driver_plans(capsys):
    """Corre el motor real, valida convergencia/KPIs y muestra tabla de planes."""
    with SessionLocal() as db:
        result = run_optimization_engine(
            db,
            "normal",
            aco_ants=12,
            aco_iterations=20,
            auto_commit=False,
            auto_dispatch=False,
            reporter=None,
        )
        simulation_id = result["simulationId"]
        routes = fetch_driver_routes_for_simulation(db, simulation_id)
        report = build_optimization_report(result, routes)

        kpis = result["kpis"]
        metrics = result.get("engineMetrics") or {}
        served = len(result.get("servedPointCodes") or [])
        uncovered = int(kpis.get("uncoveredPoints") or 0)
        point_count = served + uncovered
        convergence = assess_convergence(metrics)

        current_km = float(kpis["distanceKm"]["current"])
        optimized_km = float(kpis["distanceKm"]["optimized"])

        # --- Aserciones de realismo y convergencia ---
        assert point_count > 0, "sin puntos de recolección en BD"
        assert is_plausible_daily_optimization_kpis(kpis, point_count), (
            f"KPIs fuera de rango operativo diario: {kpis['distanceKm']} {kpis['durationHours']}"
        )
        assert convergence["ok"], convergence["reason"]
        assert len(metrics.get("acoConvergence") or []) >= 2
        # En instancias reales el ACO puede quedar ligeramente peor que el baseline greedy
        assert optimized_km <= current_km * 1.10, (
            f"ACO empeoró demasiado vs baseline: {optimized_km:.1f} vs {current_km:.1f} km"
        )
        assert float(kpis["durationHours"]["optimized"]) <= 14.0, "jornada irreal (>14 h)"

        assert len(report.driver_rows) >= 1, "debe haber al menos una ruta para conductor"
        for row in report.driver_rows:
            assert row.stops > 0, f"ruta {row.route_id} sin paradas"
            assert row.distance_km > 0
            assert row.duration_h > 0

        covered_stops = sum(row.stops for row in report.driver_rows)
        assert covered_stops == served, "paradas en rutas ≠ puntos servidos"

        print("\n" + report.markdown + "\n")
        captured = capsys.readouterr()
        assert "Plan del día por conductor" in captured.out

        db.rollback()
