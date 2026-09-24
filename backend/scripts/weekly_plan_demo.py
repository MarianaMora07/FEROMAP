"""Flujo semanal: arma el plan de la semana actual, lo optimiza y lo imprime.

Pensado para el ciclo normal de trabajo (``just week``): reiniciar la BD, crear el plan
semanal desde las agendas de visita, aprobarlo, optimizar la semana día por día y ver el
resultado por día y por camión en la terminal.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException

from app.db.session import SessionLocal
from app.services.planning_service import (
    approve_weekly_plan,
    autofill_weekly_plan_from_schedules,
    create_weekly_plan_draft,
    week_range,
)
from app.services.weekly_operational_service import generate_weekly_operational_plan

WEEKDAY_ES = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Arma y muestra el plan de la semana actual (flujo operativo).",
    )
    parser.add_argument(
        "--scenario",
        default="normal",
        help="escenario de la semana (default: normal).",
    )
    parser.add_argument(
        "--week",
        default=None,
        help="fecha de referencia ISO YYYY-MM-DD (default: hoy).",
    )
    return parser.parse_args()


def _weekday_label(operation_date: str) -> str:
    return WEEKDAY_ES[date.fromisoformat(operation_date).weekday()]


def _num(value: Any, width: int, decimals: int = 1) -> str:
    if value is None:
        return f"{'—':>{width}}"
    try:
        return f"{float(value):>{width}.{decimals}f}"
    except (TypeError, ValueError):
        return f"{'—':>{width}}"


def _render(summary: dict[str, Any], scenario: str) -> str:
    days = summary.get("days") or []
    week_start = str(summary.get("weekStartDate") or "?")
    week_end = (
        (date.fromisoformat(week_start) + timedelta(days=6)).isoformat()
        if week_start != "?"
        else "?"
    )
    lines: list[str] = [""]
    lines.append(f"═══ Plan semanal {week_start} → {week_end} · escenario {scenario} ═══")
    rotation = "sí" if summary.get("fleetRotationEnabled") else "no"
    lines.append(
        f"Flota rotativa: {rotation}  ·  flota por tipo: {summary.get('fleetByType') or '—'}"
    )
    lines.append("")
    lines.append(
        f"{'Día':<4} {'Fecha':<11} {'Estado':<9} {'Puntos':>7} {'Cub.':>7} "
        f"{'No cub.':>8} {'km':>8} {'horas':>7} {'Cam.':>5}"
    )
    lines.append("─" * 74)

    total_km = total_hours = total_served = total_uncovered = 0.0
    for day in days:
        operation_date = str(day.get("operationDate") or "?")
        vehicles = day.get("vehicles") or []
        active = [v for v in vehicles if int(v.get("stops") or 0) > 0]
        km = day.get("distanceKm")
        hours = day.get("durationHours")
        served = day.get("servedPoints")
        uncovered = day.get("uncoveredPoints")
        total_km += float(km or 0)
        total_hours += float(hours or 0)
        total_served += float(served or 0)
        total_uncovered += float(uncovered or 0)
        lines.append(
            f"{_weekday_label(operation_date) if operation_date != '?' else '?':<4} "
            f"{operation_date:<11} {str(day.get('status') or '?'):<9} "
            f"{day.get('pointCount', 0):>7} {int(served or 0):>7} {int(uncovered or 0):>8} "
            f"{_num(km, 8)} {_num(hours, 7, 2)} {len(active):>5}"
        )
    lines.append("─" * 74)
    lines.append(
        f"{'TOTAL':<4} {'':<11} {'':<9} {'':>7} {int(total_served):>7} "
        f"{int(total_uncovered):>8} {_num(total_km, 8)} {_num(total_hours, 7, 2)}"
    )

    lines.append("")
    lines.append("Reparto por camión y día:")
    for day in days:
        vehicles = [v for v in (day.get("vehicles") or []) if int(v.get("stops") or 0) > 0]
        if not vehicles:
            continue
        operation_date = str(day.get("operationDate") or "?")
        label = _weekday_label(operation_date) if operation_date != "?" else "?"
        lines.append(f"  · {operation_date} ({label}) — {len(vehicles)} camión(es)")
        for vehicle in vehicles:
            driver = vehicle.get("driverName") or "—"
            lines.append(
                f"      {str(vehicle.get('vehicleCode') or '—'):>10}  {driver:<26} "
                f"{int(vehicle.get('stops') or 0):>3} paradas  "
                f"{_num(vehicle.get('distanceKm'), 7)} km  "
                f"{_num(vehicle.get('durationMin'), 5, 0)} min"
            )

    weekly = summary.get("weekly") or {}
    lines.append("")
    lines.append(
        "KPIs de horizonte: "
        f"camiones distintos {weekly.get('distinctVehiclesWeek', '—')} · "
        f"días-camión {weekly.get('vehicleDaysUsed', '—')} · "
        f"σ días {weekly.get('usageStdDays', '—')} · "
        f"índice de rotación {weekly.get('rotationIndex', '—')}"
    )
    return "\n".join(lines)


def main() -> int:
    args = _parse_args()
    reference = date.fromisoformat(args.week) if args.week else date.today()
    week_start, _week_end = week_range(reference)

    with SessionLocal() as db:
        try:
            draft = create_weekly_plan_draft(
                db,
                week_start_date=week_start,
                scenario_id=args.scenario,
                case_study_id=None,
                days=[],
            )
            db.commit()
            plan_id = int(draft["id"])

            filled = autofill_weekly_plan_from_schedules(db, plan_id)
            db.commit()
            assigned_days = sum(
                1 for day in filled.get("days", []) if day.get("collectionPointIds")
            )

            try:
                approve_weekly_plan(db, plan_id)
            except HTTPException as exc:
                print(
                    f"⚠️  Aprobación con advertencias ({exc.detail}); se aprueba igual "
                    "para poder generar el plan operativo.",
                    file=sys.stderr,
                )
                db.rollback()
                approve_weekly_plan(db, plan_id, allow_warnings=True)
            db.commit()

            summary = generate_weekly_operational_plan(db, plan_id)

            print(f"✅ Plan semanal id={plan_id} · {assigned_days} días con puntos asignados")
            print(_render(summary, args.scenario))
            return 0
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
