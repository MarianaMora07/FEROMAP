"""Generación del plan operativo semanal (camión × día) en lotes secuenciales.

Flujo: tras aprobar el plan semanal, un job de fondo optimiza cada día laborable
(Lun→Vie) con el motor real, persiste las rutas en el plan del día (sin despachar)
y guarda un resumen camión × día en ``weekly_plans.operational_plan_json``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    CollectionPoint,
    DailyPlan,
    OptimizedRoute,
    RouteWaypoint,
    Vehicle,
    WeeklyPlan,
)

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int], None]

WORKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def _json_int_list(value: str | None) -> list[int]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [int(item) for item in parsed]
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _fleet_by_type(plan: WeeklyPlan) -> dict[str, int] | None:
    raw = plan.fleet_by_type_json
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict):
        return None
    resolved: dict[str, int] = {}
    for key, count in parsed.items():
        if isinstance(count, bool) or not isinstance(count, int) or count < 1:
            continue
        resolved[str(key)] = count
    return resolved or None


def _route_vehicle_rows(db: Session, daily_plan_id: int) -> list[dict[str, Any]]:
    """Rutas optimizadas vigentes (pending) del plan del día, por camión."""
    routes = db.scalars(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status == "pending",
        )
        .options(joinedload(OptimizedRoute.vehicle), joinedload(OptimizedRoute.driver))
        .order_by(OptimizedRoute.id)
    ).unique().all()
    rows: list[dict[str, Any]] = []
    for route in routes:
        stops = int(
            db.scalar(
                select(func.count())
                .select_from(RouteWaypoint)
                .where(
                    RouteWaypoint.route_id == route.id,
                    RouteWaypoint.waypoint_type == "collection",
                )
            )
            or 0
        )
        driver = route.driver
        rows.append(
            {
                "vehicleCode": route.vehicle.code if route.vehicle else "—",
                "driverName": f"{driver.first_name} {driver.last_name}".strip()
                if driver
                else None,
                "distanceKm": round(float(route.total_distance_meters or 0) / 1000, 1),
                "durationMin": round((route.estimated_duration_seconds or 0) / 60),
                "stops": stops,
            }
        )
    return rows


def _collect_engine_context(
    db: Session,
    plan: WeeklyPlan,
    day: Any,
    daily_plan_id: int,
    *,
    point_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Reúne escenario/flota/partición igual que el flujo diario operativo."""
    if point_ids is None:
        from app.services.planning_service import consolidate_daily_points

        point_ids = consolidate_daily_points(db, daily_plan_id)
    scenario_id = day.scenario_id_override or plan.scenario_id
    return {
        "pointIds": point_ids,
        "scenarioId": scenario_id,
        "fleetByType": _fleet_by_type(plan),
        "fleetLimit": day.expected_vehicle_count,
        "sectorPartition": False if _json_int_list(day.sector_ids_json) else None,
    }


def _assignable_vehicle_rows(db: Session) -> list[dict[str, Any]]:
    """Flota asignable (con conductor) ordenada por id, con su tipo de vehículo."""
    from app.services.vehicle_service import (
        ASSIGNABLE_STATUSES,
        get_active_routes_by_vehicle_id,
        resolve_vehicle_driver_id,
    )

    vehicles = db.scalars(
        select(Vehicle).options(joinedload(Vehicle.default_driver)).order_by(Vehicle.id)
    ).all()
    active_routes = get_active_routes_by_vehicle_id(db)
    rows: list[dict[str, Any]] = []
    for vehicle in vehicles:
        if vehicle.status not in ASSIGNABLE_STATUSES:
            continue
        if resolve_vehicle_driver_id(vehicle, active_route=active_routes.get(vehicle.id)) is None:
            continue
        rows.append({"id": vehicle.id, "code": vehicle.code, "type": vehicle.vehicle_type})
    return rows


def _rotation_rest_ids(
    fleet_rows: list[dict[str, Any]],
    usage_days: dict[int, int],
    previous_day_used: set[int],
    *,
    fleet_by_type: dict[str, int] | None = None,
    keep_limit: int | None = None,
) -> list[int]:
    """Vehículos que descansan hoy para repartir el uso de la semana (RF-5).

    Conserva el mismo tamaño de flota (cuotas por tipo si existen y, si no, el tope
    del día) pero rota las identidades: deja activos los vehículos con menos días
    acumulados y, a igualdad, los que no trabajaron el día anterior.
    """
    def _preference(row: dict[str, Any]) -> tuple[int, int, int]:
        return (
            usage_days.get(row["id"], 0),
            0 if row["id"] not in previous_day_used else 1,
            row["id"],
        )

    active: set[int] = set()
    if fleet_by_type:
        groups: dict[str, list[dict[str, Any]]] = {}
        for row in fleet_rows:
            groups.setdefault(row["type"], []).append(row)
        for vehicle_type, group in groups.items():
            quota = fleet_by_type.get(vehicle_type)
            if quota is None:
                continue
            keep = max(0, min(quota, len(group)))
            for row in sorted(group, key=_preference)[:keep]:
                active.add(row["id"])
    else:
        keep = keep_limit if keep_limit and keep_limit > 0 else len(fleet_rows)
        keep = max(0, min(keep, len(fleet_rows)))
        for row in sorted(fleet_rows, key=_preference)[:keep]:
            active.add(row["id"])

    if not active:
        return []
    return [row["id"] for row in fleet_rows if row["id"] not in active]


def compute_weekly_rotation_kpis(days: list[dict[str, Any]]) -> dict[str, Any]:
    """KPIs de horizonte (Fase 13, §5.2) sobre el resumen camión × día."""
    counts: dict[str, int] = {}
    for day in days:
        for vehicle in day.get("vehicles") or []:
            code = vehicle.get("vehicleCode")
            if not code or code == "—":
                continue
            if int(vehicle.get("stops") or 0) <= 0:
                continue
            counts[str(code)] = counts.get(str(code), 0) + 1

    values = list(counts.values())
    distinct = len(counts)
    total_days = sum(values)
    mean_days = total_days / distinct if distinct else 0.0
    if distinct:
        std_days = math.sqrt(sum((value - mean_days) ** 2 for value in values) / distinct)
    else:
        std_days = 0.0
    rotation_index = (
        max(0.0, min(1.0, 1.0 - std_days / mean_days)) if mean_days > 0 else 1.0
    )
    return {
        "distinctVehiclesWeek": distinct,
        "vehicleDaysUsed": total_days,
        "usageStdDays": round(std_days, 2),
        "rotationIndex": round(rotation_index, 2),
    }


def _prepare_draft_daily_plan(
    db: Session, plan: WeeklyPlan, day: Any
) -> tuple[int, list[int]]:
    """Prepara el plan del día de un borrador semanal (revisión antes de aprobar).

    No usa ``open_daily_plan``/``resolve_scheduled_point_ids`` (que exigen semana
    aprobada): resuelve los puntos desde el propio plan y asocia el ``DailyPlan``
    al plan semanal en borrador. Devuelve ``(daily_plan_id, point_ids)``.
    """
    from app.db.models import PendingVisit
    from app.services.case_study_planning import resolve_weekly_day_point_ids

    operation_date = day.operation_date
    resolved_ids, _source, _case = resolve_weekly_day_point_ids(db, plan, day)
    pending_ids = [
        visit.collection_point_id
        for visit in db.scalars(
            select(PendingVisit)
            .where(
                PendingVisit.status == "open",
                (PendingVisit.target_operation_date.is_(None))
                | (PendingVisit.target_operation_date == operation_date),
            )
            .order_by(PendingVisit.priority.desc(), PendingVisit.id)
        ).all()
    ]
    final_ids = sorted(set(resolved_ids) | set(pending_ids))

    daily = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
    if daily is None:
        daily = DailyPlan(
            operation_date=operation_date,
            weekly_plan_id=plan.id,
            weekly_plan_day_id=day.id,
            status="draft",
            scenario_id=day.scenario_id_override or plan.scenario_id,
            scheduled_point_ids_json=json.dumps(resolved_ids),
            pending_point_ids_json=json.dumps(pending_ids),
            final_point_ids_json=json.dumps(final_ids),
        )
        db.add(daily)
        db.flush()
    else:
        daily.weekly_plan_id = plan.id
        daily.weekly_plan_day_id = day.id
        daily.scheduled_point_ids_json = json.dumps(resolved_ids)
        daily.pending_point_ids_json = json.dumps(pending_ids)
        daily.final_point_ids_json = json.dumps(final_ids)
    return daily.id, final_ids


def _signature_entry(day: Any, ctx: dict[str, Any]) -> dict[str, Any]:
    """Configuración que determina la optimización de un día (para la firma de reuso)."""
    return {
        "operationDate": day.operation_date.isoformat(),
        "scenarioId": ctx["scenarioId"],
        "fleetLimit": ctx["fleetLimit"],
        "sectorPartition": ctx["sectorPartition"],
        "pointIds": sorted(int(point_id) for point_id in ctx["pointIds"]),
    }


def _hash_signature(
    plan: WeeklyPlan, entries: list[dict[str, Any]], *, rotation_enabled: bool
) -> str:
    """Hash estable de la configuración semanal que produce el plan operativo.

    Si la configuración cambia (puntos, escenario, flota esperada o por tipo, rotación),
    la firma cambia y el resumen persistido deja de ser reutilizable.
    """
    payload = {
        "weekStartDate": plan.week_start_date.isoformat(),
        "scenarioId": plan.scenario_id,
        "fleetByType": _fleet_by_type(plan),
        "rotation": bool(rotation_enabled),
        "days": entries,
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _signature_entry_for_day(db: Session, plan: WeeklyPlan, day: Any) -> dict[str, Any]:
    """Prepara el día (crea/reutiliza su ``DailyPlan``) y devuelve su entrada de firma."""
    if plan.status == "approved":
        from app.services.planning_service import open_daily_plan

        daily = open_daily_plan(db, day.operation_date)
        ctx = _collect_engine_context(db, plan, day, int(daily["id"]))
    else:
        daily_plan_id, final_ids = _prepare_draft_daily_plan(db, plan, day)
        ctx = _collect_engine_context(db, plan, day, daily_plan_id, point_ids=final_ids)
    return _signature_entry(day, ctx)


def _reuse_persisted_operational_summary(
    db: Session,
    plan: WeeklyPlan,
    days: list[Any],
    *,
    rotation_enabled: bool,
) -> dict[str, Any] | None:
    """Devuelve el resumen operativo persistido si sigue siendo válido para ``plan``.

    Reutilizar evita la segunda pasada del motor cuando la semana ya fue optimizada
    (p. ej. la validación persistente): basta con que la configuración coincida. Un
    día con error invalida el resumen para forzar el recálculo.
    """
    if not plan.operational_plan_json:
        return None
    try:
        stored = json.loads(plan.operational_plan_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(stored, dict) or not stored.get("signature"):
        return None
    stored_days = stored.get("days")
    if not isinstance(stored_days, list) or len(stored_days) != len(days):
        return None
    if bool(stored.get("fleetRotationEnabled")) != bool(rotation_enabled):
        return None
    if any(isinstance(row, dict) and row.get("status") == "error" for row in stored_days):
        return None

    try:
        entries = [_signature_entry_for_day(db, plan, day) for day in days]
    except Exception:  # noqa: BLE001
        db.rollback()
        return None
    if stored.get("signature") != _hash_signature(plan, entries, rotation_enabled=rotation_enabled):
        return None
    return stored


def generate_weekly_operational_plan(
    db: Session,
    plan_id: int,
    *,
    weekly_fleet_rotation: bool | None = None,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Optimiza la semana día por día y persiste el resumen camión × día.

    Si ya existe un resumen persistido con la **misma configuración** (ver
    :func:`_reuse_persisted_operational_summary`), se reutiliza sin volver a correr el
    motor: la semana se optimiza una sola vez aunque se valide y luego se pida «Ver
    plan».
    """
    from app.services.admin_service import get_algorithm_settings
    from app.services.optimization_service import run_optimization_engine
    from app.services.planning_service import open_daily_plan

    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.id == plan_id)
        .options(joinedload(WeeklyPlan.days))
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    if plan.status not in ("draft", "approved"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede generar el plan operativo de un borrador o de una semana aprobada",
        )

    days = sorted(
        (day for day in plan.days if day.operation_date.weekday() <= 4),
        key=lambda day: day.operation_date,
    )
    if not days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El plan semanal no tiene días laborables configurados",
        )

    # Seguridad: no regenerar si algún día ya fue notificado/despachado.
    dispatched_dates = db.scalars(
        select(DailyPlan.operation_date).where(
            DailyPlan.weekly_plan_id == plan.id,
            DailyPlan.status == "dispatched",
        )
    ).all()
    if dispatched_dates:
        dates = ", ".join(sorted(date.isoformat() for date in dispatched_dates))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede regenerar: el día "
                + dates
                + " ya fue notificado a conductores. Cierra esos días antes de regenerar."
            ),
        )

    total = len(days)
    result_rows: list[dict[str, Any]] = []
    signature_entries: list[dict[str, Any]] = []

    # Fase 13.4 — rotación de flota en el horizonte (uso acumulado de la semana).
    rotation_enabled = (
        weekly_fleet_rotation
        if weekly_fleet_rotation is not None
        else bool(get_algorithm_settings(db).weekly_fleet_rotation)
    )

    # Reutiliza el resumen ya persistido (p. ej. el que deja la validación) cuando la
    # configuración no cambió: evita la segunda pasada del motor.
    reused = _reuse_persisted_operational_summary(
        db, plan, days, rotation_enabled=rotation_enabled
    )
    if reused is not None:
        return reused

    fleet_rows = _assignable_vehicle_rows(db) if rotation_enabled else []
    code_to_vehicle_id = {row["code"]: int(row["id"]) for row in fleet_rows}
    usage_days: dict[int, int] = {int(row["id"]): 0 for row in fleet_rows}
    previous_day_used: set[int] = set()

    def report(day_index: int, message: str) -> None:
        if on_progress is not None:
            base = int((day_index - 1) * 100 / max(1, total))
            on_progress(message, base)

    for index, day in enumerate(days, start=1):
        label = WORKDAY_LABELS[day.operation_date.weekday()]
        day_summary: dict[str, Any] = {
            "operationDate": day.operation_date.isoformat(),
            "weekday": day.weekday,
            "status": "skipped",
        }
        try:
            report(index, f"{label} {day.operation_date} · preparando ({index}/{total})")
            if plan.status == "approved":
                daily = open_daily_plan(db, day.operation_date)
                daily_plan_id = daily["id"]
                ctx = _collect_engine_context(db, plan, day, daily_plan_id)
            else:
                daily_plan_id, final_ids = _prepare_draft_daily_plan(db, plan, day)
                ctx = _collect_engine_context(db, plan, day, daily_plan_id, point_ids=final_ids)
            signature_entries.append(_signature_entry(day, ctx))
            if not ctx["pointIds"]:
                day_summary.update({"status": "skipped", "reason": "sin puntos"})
                result_rows.append(day_summary)
                if on_progress is not None:
                    on_progress(
                        f"{label} {day.operation_date} · sin puntos",
                        int(index * 100 / max(1, total)),
                    )
                continue

            report(index, f"{label} {day.operation_date} · optimizando con ACO ({index}/{total})")
            rotation_rest_ids: list[int] = []
            if rotation_enabled and fleet_rows:
                rotation_rest_ids = _rotation_rest_ids(
                    fleet_rows,
                    usage_days,
                    previous_day_used,
                    fleet_by_type=ctx["fleetByType"],
                    keep_limit=ctx["fleetLimit"],
                )
                if rotation_rest_ids:
                    rested_codes = [
                        row["code"] for row in fleet_rows if int(row["id"]) in set(rotation_rest_ids)
                    ]
                    report(
                        index,
                        f"{label} {day.operation_date} · rotación de flota: descansan {'/'.join(rested_codes)} ({index}/{total})",
                    )
            result = run_optimization_engine(
                db,
                ctx["scenarioId"],
                collection_point_ids=ctx["pointIds"],
                fleet_limit=ctx["fleetLimit"],
                fleet_by_type=ctx["fleetByType"],
                sector_partition=ctx["sectorPartition"],
                exclude_vehicle_ids=rotation_rest_ids or None,
                auto_commit=True,
                auto_dispatch=False,
                reporter=None,
                planning_level="administrative",
                weekly_plan_id=plan.id,
                daily_plan_id=daily_plan_id,
                operation_date=day.operation_date,
            )

            kpis = result["kpis"]
            served = int(kpis.get("containersServed") or 0) or len(result.get("servedPointCodes") or [])
            uncovered = int(kpis.get("uncoveredPoints") or 0)
            # `coveragePct` es un KPI con forma {current, optimized} (igual que `distanceKm`).
            coverage_raw = kpis.get("coveragePct")
            coverage_pct = (
                coverage_raw.get("optimized") if isinstance(coverage_raw, dict) else coverage_raw
            )
            current_day = db.get(DailyPlan, daily_plan_id)
            day_summary.update(
                {
                    "dailyPlanId": daily_plan_id,
                    "simulationId": result.get("simulationId"),
                    "status": current_day.status if current_day else "optimized",
                    "scenarioId": ctx["scenarioId"],
                    "pointCount": len(ctx["pointIds"]),
                    "servedPoints": served,
                    "uncoveredPoints": uncovered,
                    # Base comparable y cobertura para derivar el forecast de la validación.
                    "baselineDistanceKm": round(
                        float((kpis.get("distanceKm") or {}).get("current") or 0), 1
                    ),
                    "coveragePct": coverage_pct,
                    "feasible": uncovered == 0,
                    "distanceKm": round(kpis["distanceKm"]["optimized"], 1),
                    "durationHours": round(float(kpis["durationHours"]["optimized"]), 2),
                    "vehicles": _route_vehicle_rows(db, daily_plan_id),
                }
            )
            if rotation_enabled and fleet_rows:
                day_used_ids = {
                    code_to_vehicle_id[str(row.get("vehicleCode"))]
                    for row in day_summary.get("vehicles") or []
                    if int(row.get("stops") or 0) > 0
                    and str(row.get("vehicleCode")) in code_to_vehicle_id
                }
                for vehicle_id in day_used_ids:
                    usage_days[vehicle_id] = usage_days.get(vehicle_id, 0) + 1
                previous_day_used = day_used_ids
                day_summary["restedVehicleIds"] = rotation_rest_ids
                day_summary["activeVehicleIds"] = sorted(day_used_ids)
            if on_progress is not None:
                on_progress(
                    f"{label} {day.operation_date} · listo ({index}/{total})",
                    int(index * 100 / max(1, total)),
                )
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            logger.exception("Fallo al generar plan operativo del día %s", day.operation_date)
            day_summary.update({"status": "error", "error": str(exc)})
        result_rows.append(day_summary)

    summary: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "weekStartDate": plan.week_start_date.isoformat(),
        "fleetByType": _fleet_by_type(plan),
        "fleetRotationEnabled": bool(rotation_enabled),
        "signature": _hash_signature(
            plan, signature_entries, rotation_enabled=rotation_enabled
        ),
        "days": result_rows,
    }
    # Fase 13.4 — KPIs de horizonte (distinctVehiclesWeek, vehicleDaysUsed, …).
    summary["weekly"] = compute_weekly_rotation_kpis(result_rows)
    plan.operational_plan_json = json.dumps(summary, ensure_ascii=False)
    db.commit()
    return summary


def notify_weekly_operational_days(db: Session, plan_id: int) -> list[dict[str, Any]]:
    """Notifica (despacha) todos los días optimizados de la semana.

    Idempotente: solo procesa días cuyo DailyPlan está en estado ``optimized``.
    Días ya notificados o cerrados se omiten.
    """
    from app.services.notification_service import notify_routes_dispatched
    from app.services.operations_service import dispatch_optimized_routes
    from app.services.planning_service import mark_daily_plan_dispatched

    plan = db.get(WeeklyPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")

    days = db.scalars(
        select(DailyPlan)
        .where(
            DailyPlan.weekly_plan_id == plan.id,
            DailyPlan.status == "optimized",
        )
        .order_by(DailyPlan.operation_date)
    ).all()

    notified: list[dict[str, Any]] = []
    for day in days:
        result = dispatch_optimized_routes(db, daily_plan_id=day.id)
        mark_daily_plan_dispatched(db, day.id)
        notify_routes_dispatched(db, result.get("dispatchedRouteIds") or [])
        notified.append(
            {
                "operationDate": day.operation_date.isoformat(),
                "status": "dispatched",
                "dailyPlanId": day.id,
                "dispatchedRouteIds": result.get("dispatchedRouteIds") or [],
            }
        )
        db.flush()
    return notified
