"""Evidencia AC-3 — rotación de flota en un horizonte semanal real (Fase 13.4).

Crea una semana demo en el futuro, rotando la flota Lun→Vie con el motor real, e
imprime los KPIs de horizonte. Limpia todo lo creado al terminar.

Uso: ``podman exec feromap-api python -m scripts.phase13_weekly_evidence``
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import delete, select

from app.db.models import (
    DailyPlan,
    OptimizedRoute,
    RouteWaypoint,
    Sector,
    Simulation,
    WeeklyPlan,
    WeeklyPlanDay,
)
from app.db.session import SessionLocal
from app.services.planning_service import create_weekly_plan_draft, week_range
from app.services.weekly_operational_service import generate_weekly_operational_plan

EXPECTED_VEHICLES_PER_DAY = 6


def _cleanup(db, week_start: date, plan_id: int | None) -> None:
    day_ids = list(
        db.scalars(select(DailyPlan.id).where(DailyPlan.operation_date.between(week_start, week_start + timedelta(days=4))))
    )
    if day_ids:
        route_ids = list(db.scalars(select(OptimizedRoute.id).where(OptimizedRoute.daily_plan_id.in_(day_ids))))
        sim_ids = list(
            db.scalars(
                select(OptimizedRoute.simulation_id).where(
                    OptimizedRoute.daily_plan_id.in_(day_ids),
                    OptimizedRoute.simulation_id.is_not(None),
                )
            )
        )
        if route_ids:
            db.execute(delete(RouteWaypoint).where(RouteWaypoint.route_id.in_(route_ids)))
            db.execute(delete(OptimizedRoute).where(OptimizedRoute.id.in_(route_ids)))
        # El plan del día referencia la simulación: borrar el plan antes que la simulación.
        db.execute(delete(DailyPlan).where(DailyPlan.id.in_(day_ids)))
        if sim_ids:
            db.execute(delete(Simulation).where(Simulation.id.in_(set(sim_ids))))
    if plan_id is not None:
        db.execute(delete(WeeklyPlanDay).where(WeeklyPlanDay.weekly_plan_id == plan_id))
        db.execute(delete(WeeklyPlan).where(WeeklyPlan.id == plan_id))
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        week_start, _ = week_range(date.today() + timedelta(days=60))
        existing = db.scalar(select(WeeklyPlan).where(WeeklyPlan.week_start_date == week_start))
        if existing is not None:
            _cleanup(db, week_start, existing.id)

        sector_ids = list(db.scalars(select(Sector.id).where(Sector.deleted_at.is_(None))))
        days = [
            {
                "operation_date": week_start + timedelta(days=offset),
                "sector_ids": sector_ids,
                "expected_vehicle_count": EXPECTED_VEHICLES_PER_DAY,
            }
            for offset in range(5)
        ]
        created = create_weekly_plan_draft(
            db,
            week_start_date=week_start,
            scenario_id="normal",
            days=days,
        )
        plan_id = created["id"]
        db.commit()

        try:
            summary = generate_weekly_operational_plan(db, plan_id, weekly_fleet_rotation=True)
            weekly = summary["weekly"]
            print(f"Semana demo {week_start.isoformat()} · rotación={summary['fleetRotationEnabled']}")
            print(
                f"KPIs de horizonte: distinctVehiclesWeek={weekly['distinctVehiclesWeek']} "
                f"vehicleDaysUsed={weekly['vehicleDaysUsed']} "
                f"usageStdDays={weekly['usageStdDays']} rotationIndex={weekly['rotationIndex']}"
            )
            for day in summary["days"]:
                codes = "/".join(
                    row["vehicleCode"] for row in (day.get("vehicles") or []) if int(row.get("stops") or 0) > 0
                )
                print(
                    f"  {day['operationDate']} · {day.get('status')} · activos: {codes or '—'} "
                    f"· descansan ids: {day.get('restedVehicleIds') or []}"
                )
            ac3 = weekly["distinctVehiclesWeek"] >= 6 and weekly["usageStdDays"] <= 1
            print(f"AC-3 (distinctVehiclesWeek ≥ 6 y usageStdDays ≤ 1): {'OK' if ac3 else 'FALLA'}")
        finally:
            _cleanup(db, week_start, plan_id)
            print("Datos de la semana demo eliminados.")


if __name__ == "__main__":
    main()
