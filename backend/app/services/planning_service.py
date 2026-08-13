"""Servicio de planificación operativa (semanal, diaria, pendientes)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    CollectionPoint,
    DailyPlan,
    OptimizedRoute,
    PendingVisit,
    PlanVersion,
    RouteWaypoint,
    Simulation,
    VehicleIncident,
    VisitSchedule,
    WeeklyPlan,
    WeeklyPlanDay,
    VehicleIncident,
)


def _json_list(value: str | None) -> list[int]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return [int(item) for item in parsed]
    except (TypeError, ValueError, json.JSONDecodeError):
        return []


def _dump_json_list(values: list[int]) -> str:
    return json.dumps(sorted(set(values)))


def monday_of_week(value: date) -> date:
    return value - timedelta(days=value.weekday())


def week_range(week_start: date) -> tuple[date, date]:
    start = monday_of_week(week_start)
    return start, start + timedelta(days=6)


def _serialize_point(point: CollectionPoint) -> dict[str, Any]:
    return {
        "id": point.id,
        "code": point.code,
        "sectorName": point.sector.name if point.sector else None,
        "fillLevelPct": float(point.current_fill_level_kg / point.max_capacity_kg * 100)
        if float(point.max_capacity_kg) > 0
        else 0,
    }


def _serialize_pending(db: Session, visit: PendingVisit) -> dict[str, Any]:
    point = visit.collection_point or db.get(CollectionPoint, visit.collection_point_id)
    return {
        "id": visit.id,
        "collectionPointId": visit.collection_point_id,
        "code": point.code if point else None,
        "originOperationDate": visit.origin_operation_date.isoformat(),
        "targetOperationDate": visit.target_operation_date.isoformat() if visit.target_operation_date else None,
        "reason": visit.reason,
        "status": visit.status,
        "priority": visit.priority,
    }


def _weekly_plan_payload(plan: WeeklyPlan) -> dict[str, Any]:
    expected_kpis = None
    if plan.expected_kpis_json:
        expected_kpis = json.loads(plan.expected_kpis_json)
    return {
        "id": plan.id,
        "weekStartDate": plan.week_start_date.isoformat(),
        "weekEndDate": plan.week_end_date.isoformat(),
        "status": plan.status,
        "scenarioId": plan.scenario_id,
        "referenceSimulationId": plan.reference_simulation_id,
        "expectedKpis": expected_kpis,
        "notes": plan.notes,
        "approvedAt": plan.approved_at.isoformat() if plan.approved_at else None,
        "days": [
            {
                "id": day.id,
                "operationDate": day.operation_date.isoformat(),
                "weekday": day.weekday,
                "sectorIds": _json_list(day.sector_ids_json),
                "collectionPointIds": _json_list(day.collection_point_ids_json),
                "expectedVehicleCount": day.expected_vehicle_count,
                "scenarioIdOverride": day.scenario_id_override,
                "status": day.status,
            }
            for day in sorted(plan.days, key=lambda row: row.operation_date)
        ],
    }


def _daily_plan_payload(db: Session, plan: DailyPlan) -> dict[str, Any]:
    scheduled_ids = _json_list(plan.scheduled_point_ids_json)
    pending_ids = _json_list(plan.pending_point_ids_json)
    final_ids = _json_list(plan.final_point_ids_json)

    point_map: dict[int, CollectionPoint] = {}
    if scheduled_ids or pending_ids or final_ids:
        all_ids = sorted(set(scheduled_ids + pending_ids + final_ids))
        points = db.scalars(
            select(CollectionPoint)
            .where(CollectionPoint.id.in_(all_ids))
            .options(joinedload(CollectionPoint.sector))
        ).all()
        point_map = {point.id: point for point in points}

    open_pending = db.scalars(
        select(PendingVisit)
        .where(
            PendingVisit.status == "open",
            (PendingVisit.target_operation_date.is_(None))
            | (PendingVisit.target_operation_date == plan.operation_date),
        )
        .options(joinedload(PendingVisit.collection_point).joinedload(CollectionPoint.sector))
        .order_by(PendingVisit.priority.desc(), PendingVisit.id)
    ).all()

    return {
        "id": plan.id,
        "operationDate": plan.operation_date.isoformat(),
        "status": plan.status,
        "scenarioId": plan.scenario_id,
        "weeklyPlanId": plan.weekly_plan_id,
        "simulationId": plan.simulation_id,
        "scheduledPoints": [_serialize_point(point_map[pid]) for pid in scheduled_ids if pid in point_map],
        "pendingPoints": [_serialize_pending(db, visit) for visit in open_pending],
        "pendingPointIds": pending_ids,
        "finalPointIds": final_ids,
        "dispatchedAt": plan.dispatched_at.isoformat() if plan.dispatched_at else None,
        "closedAt": plan.closed_at.isoformat() if plan.closed_at else None,
        "notes": plan.notes,
    }


def _record_version(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    snapshot: dict[str, Any],
    summary: str,
    user_id: int | None = None,
) -> None:
    last_version = db.scalar(
        select(PlanVersion.version_number)
        .where(PlanVersion.entity_type == entity_type, PlanVersion.entity_id == entity_id)
        .order_by(PlanVersion.version_number.desc())
        .limit(1)
    )
    db.add(
        PlanVersion(
            entity_type=entity_type,
            entity_id=entity_id,
            version_number=(last_version or 0) + 1,
            snapshot_json=json.dumps(snapshot, ensure_ascii=False),
            change_summary=summary,
            created_by_user_id=user_id,
        )
    )


def list_weekly_plans(
    db: Session,
    *,
    status: str | None = None,
    week_from: date | None = None,
    week_to: date | None = None,
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    stmt = select(WeeklyPlan).options(joinedload(WeeklyPlan.days)).order_by(WeeklyPlan.week_start_date.desc())
    if status:
        stmt = stmt.where(WeeklyPlan.status == status)
    if week_from is not None:
        stmt = stmt.where(WeeklyPlan.week_start_date >= week_from)
    if week_to is not None:
        stmt = stmt.where(WeeklyPlan.week_start_date <= week_to)
    plans = db.scalars(stmt.offset(offset).limit(limit)).unique().all()
    total_stmt = select(func.count()).select_from(WeeklyPlan)
    if status:
        total_stmt = total_stmt.where(WeeklyPlan.status == status)
    if week_from is not None:
        total_stmt = total_stmt.where(WeeklyPlan.week_start_date >= week_from)
    if week_to is not None:
        total_stmt = total_stmt.where(WeeklyPlan.week_start_date <= week_to)
    total = db.scalar(total_stmt) or 0
    return {
        "items": [_weekly_plan_payload(plan) for plan in plans],
        "count": len(plans),
        "total": total,
    }


def get_current_weekly_plan(db: Session, *, reference: date | None = None) -> dict[str, Any] | None:
    week_start, _ = week_range(reference or date.today())
    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.week_start_date == week_start, WeeklyPlan.status == "approved")
        .options(joinedload(WeeklyPlan.days))
    )
    return _weekly_plan_payload(plan) if plan else None


def get_weekly_plan(db: Session, plan_id: int) -> dict[str, Any]:
    plan = db.scalar(
        select(WeeklyPlan).where(WeeklyPlan.id == plan_id).options(joinedload(WeeklyPlan.days))
    )
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    return _weekly_plan_payload(plan)


def create_weekly_plan_draft(
    db: Session,
    *,
    week_start_date: date,
    scenario_id: str,
    days: list[dict[str, Any]],
    notes: str | None = None,
) -> dict[str, Any]:
    week_start, week_end = week_range(week_start_date)
    existing = db.scalar(select(WeeklyPlan).where(WeeklyPlan.week_start_date == week_start))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un plan para la semana que inicia {week_start.isoformat()}",
        )

    plan = WeeklyPlan(
        week_start_date=week_start,
        week_end_date=week_end,
        status="draft",
        scenario_id=scenario_id,
        notes=notes,
    )
    db.add(plan)
    db.flush()

    for day_input in days:
        operation_date = day_input["operation_date"]
        if not week_start <= operation_date <= week_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"La fecha {operation_date} no pertenece a la semana del plan",
            )
        db.add(
            WeeklyPlanDay(
                weekly_plan_id=plan.id,
                operation_date=operation_date,
                weekday=operation_date.weekday(),
                sector_ids_json=_dump_json_list(day_input.get("sector_ids", [])),
                collection_point_ids_json=_dump_json_list(day_input.get("collection_point_ids", [])),
                expected_vehicle_count=day_input.get("expected_vehicle_count"),
                scenario_id_override=day_input.get("scenario_id_override"),
            )
        )

    db.flush()
    db.refresh(plan)
    return get_weekly_plan(db, plan.id)


def update_weekly_plan(
    db: Session,
    plan_id: int,
    *,
    days: list[dict[str, Any]] | None,
    scenario_id: str | None,
    notes: str | None,
) -> dict[str, Any]:
    plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.id == plan_id).options(joinedload(WeeklyPlan.days)))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    if plan.status == "approved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede editar un plan aprobado")

    if scenario_id is not None:
        plan.scenario_id = scenario_id
    if notes is not None:
        plan.notes = notes

    if days:
        for day in list(plan.days):
            db.delete(day)
        db.flush()
        week_start, week_end = plan.week_start_date, plan.week_end_date
        for day_input in days:
            operation_date = day_input["operation_date"]
            if not week_start <= operation_date <= week_end:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"La fecha {operation_date} no pertenece a la semana del plan",
                )
            db.add(
                WeeklyPlanDay(
                    weekly_plan_id=plan.id,
                    operation_date=operation_date,
                    weekday=operation_date.weekday(),
                    sector_ids_json=_dump_json_list(day_input.get("sector_ids", [])),
                    collection_point_ids_json=_dump_json_list(day_input.get("collection_point_ids", [])),
                    expected_vehicle_count=day_input.get("expected_vehicle_count"),
                    scenario_id_override=day_input.get("scenario_id_override"),
                )
            )

    db.flush()
    return get_weekly_plan(db, plan.id)


def approve_weekly_plan(
    db: Session,
    plan_id: int,
    *,
    reference_simulation_id: int | None = None,
    expected_kpis: dict[str, Any] | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.id == plan_id).options(joinedload(WeeklyPlan.days)))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    if plan.status != "draft":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Solo se pueden aprobar planes en borrador")
    if not plan.days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El plan semanal no tiene días configurados")

    plan.status = "approved"
    plan.approved_at = datetime.now(timezone.utc)
    plan.approved_by_user_id = user_id
    if reference_simulation_id is not None:
        plan.reference_simulation_id = reference_simulation_id
    if expected_kpis is not None:
        plan.expected_kpis_json = json.dumps(expected_kpis, ensure_ascii=False)

    _record_version(
        db,
        entity_type="weekly_plan",
        entity_id=plan.id,
        snapshot=_weekly_plan_payload(plan),
        summary="Plan semanal aprobado",
        user_id=user_id,
    )
    db.flush()
    return get_weekly_plan(db, plan.id)


def compute_pending_priority(
    origin_operation_date: date,
    point: CollectionPoint | None = None,
    *,
    reason: str = "not_visited",
) -> int:
    days_old = max(0, (date.today() - origin_operation_date).days)
    priority = 100 + days_old * 10
    reason_weights = {
        "skipped_breakdown": 40,
        "not_visited": 20,
        "critical_overflow": 35,
        "manual_escalation": 25,
    }
    priority += reason_weights.get(reason, 0)
    if point is not None:
        if bool(getattr(point, "priority_boost", False)):
            priority += 50
        max_cap = getattr(point, "max_capacity_kg", None)
        current = getattr(point, "current_fill_level_kg", None)
        if max_cap is not None and current is not None and float(max_cap) > 0:
            fill_level = int(round(float(current) / float(max_cap) * 100))
            if fill_level >= 80:
                priority += 30
            elif fill_level >= 60:
                priority += 15
    return priority


def _refresh_open_pending_priorities(db: Session) -> None:
    visits = db.scalars(
        select(PendingVisit)
        .where(PendingVisit.status == "open")
        .options(joinedload(PendingVisit.collection_point))
    ).all()
    for visit in visits:
        visit.priority = compute_pending_priority(
            visit.origin_operation_date,
            visit.collection_point,
            reason=visit.reason,
        )
    db.flush()


def get_weekly_plan_day(db: Session, operation_date: date) -> WeeklyPlanDay | None:
    week_start, _ = week_range(operation_date)
    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.week_start_date == week_start, WeeklyPlan.status == "approved")
        .options(joinedload(WeeklyPlan.days))
    )
    if plan is None:
        return None
    return next((row for row in plan.days if row.operation_date == operation_date), None)


def get_daily_plan_execution_context(db: Session, daily_plan_id: int) -> dict[str, Any]:
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")
    weekly_day = get_weekly_plan_day(db, plan.operation_date)
    scenario_id = plan.scenario_id
    fleet_limit: int | None = None
    if weekly_day is not None:
        if weekly_day.scenario_id_override:
            scenario_id = weekly_day.scenario_id_override
        fleet_limit = weekly_day.expected_vehicle_count
    return {
        "scenarioId": scenario_id,
        "fleetLimit": fleet_limit,
        "weeklyPlanDayId": weekly_day.id if weekly_day else None,
    }


def resolve_scheduled_point_ids(db: Session, operation_date: date) -> list[int]:
    week_start, _ = week_range(operation_date)
    plan = db.scalar(
        select(WeeklyPlan)
        .where(WeeklyPlan.week_start_date == week_start, WeeklyPlan.status == "approved")
        .options(joinedload(WeeklyPlan.days))
    )
    if plan is None:
        return []

    day = next((row for row in plan.days if row.operation_date == operation_date), None)
    if day is None:
        return []

    point_ids = set(_json_list(day.collection_point_ids_json))
    sector_ids = _json_list(day.sector_ids_json)
    if sector_ids:
        sector_points = db.scalars(
            select(CollectionPoint.id).where(
                CollectionPoint.sector_id.in_(sector_ids),
                CollectionPoint.deleted_at.is_(None),
                CollectionPoint.status == "active",
            )
        ).all()
        point_ids.update(sector_points)
    return sorted(point_ids)


def list_pending_visits(
    db: Session,
    *,
    status: str | None = "open",
    target_date: date | None = None,
    origin_from: date | None = None,
    origin_to: date | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        select(PendingVisit)
        .options(joinedload(PendingVisit.collection_point).joinedload(CollectionPoint.sector))
        .order_by(PendingVisit.priority.desc(), PendingVisit.id)
    )
    if status:
        stmt = stmt.where(PendingVisit.status == status)
    if target_date is not None:
        stmt = stmt.where(
            (PendingVisit.target_operation_date.is_(None)) | (PendingVisit.target_operation_date == target_date)
        )
    if origin_from is not None:
        stmt = stmt.where(PendingVisit.origin_operation_date >= origin_from)
    if origin_to is not None:
        stmt = stmt.where(PendingVisit.origin_operation_date <= origin_to)
    visits = db.scalars(stmt).all()
    return [_serialize_pending(db, visit) for visit in visits]


def list_open_pending_visits(db: Session, *, target_date: date | None = None) -> list[dict[str, Any]]:
    return list_pending_visits(db, status="open", target_date=target_date)


def get_daily_plan_by_date(db: Session, operation_date: date) -> dict[str, Any]:
    plan = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")
    return _daily_plan_payload(db, plan)


ACTIVE_DAILY_PLAN_STATUSES = ("draft", "optimized", "dispatched")


def get_active_daily_plan(
    db: Session,
    *,
    operation_date: date | None = None,
) -> DailyPlan | None:
    """Plan operativo del día: draft/optimized/dispatched o con rutas aún activas."""
    target = operation_date or date.today()
    plan = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == target))
    if plan is None:
        return None
    if plan.status in ACTIVE_DAILY_PLAN_STATUSES:
        return plan

    has_active_routes = db.scalar(
        select(OptimizedRoute.id)
        .where(
            OptimizedRoute.daily_plan_id == plan.id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status.in_(("pending", "in_progress")),
        )
        .limit(1)
    )
    return plan if has_active_routes is not None else None


def get_or_create_daily_plan(db: Session, operation_date: date) -> dict[str, Any]:
    plan = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
    if plan is None:
        week_start, _ = week_range(operation_date)
        weekly_plan = db.scalar(
            select(WeeklyPlan)
            .where(WeeklyPlan.week_start_date == week_start, WeeklyPlan.status == "approved")
            .options(joinedload(WeeklyPlan.days))
        )
        weekly_day = None
        if weekly_plan is not None:
            weekly_day = next((row for row in weekly_plan.days if row.operation_date == operation_date), None)

        scheduled_ids = resolve_scheduled_point_ids(db, operation_date)
        scenario_id = weekly_plan.scenario_id if weekly_plan else "normal"
        if weekly_day is not None and weekly_day.scenario_id_override:
            scenario_id = weekly_day.scenario_id_override
        plan = DailyPlan(
            operation_date=operation_date,
            weekly_plan_id=weekly_plan.id if weekly_plan else None,
            weekly_plan_day_id=weekly_day.id if weekly_day else None,
            status="draft",
            scenario_id=scenario_id,
            scheduled_point_ids_json=_dump_json_list(scheduled_ids),
        )
        db.add(plan)
        db.flush()

    return _daily_plan_payload(db, plan)


def consolidate_daily_points(db: Session, daily_plan_id: int) -> list[int]:
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")

    _refresh_open_pending_priorities(db)
    exec_ctx = get_daily_plan_execution_context(db, daily_plan_id)
    plan.scenario_id = exec_ctx["scenarioId"]

    scheduled_ids = resolve_scheduled_point_ids(db, plan.operation_date)
    if not scheduled_ids:
        scheduled_ids = _json_list(plan.scheduled_point_ids_json)

    pending_visits = db.scalars(
        select(PendingVisit)
        .where(
            PendingVisit.status == "open",
            (PendingVisit.target_operation_date.is_(None))
            | (PendingVisit.target_operation_date == plan.operation_date),
        )
        .order_by(PendingVisit.priority.desc(), PendingVisit.id)
    ).all()
    pending_ids = [visit.collection_point_id for visit in pending_visits]

    final_ids = sorted(set(scheduled_ids) | set(pending_ids))
    if not final_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Día sin puntos programados ni pendientes para optimizar",
        )

    plan.scheduled_point_ids_json = _dump_json_list(scheduled_ids)
    plan.pending_point_ids_json = _dump_json_list(pending_ids)
    plan.final_point_ids_json = _dump_json_list(final_ids)
    db.flush()
    return final_ids


def open_daily_plan(db: Session, operation_date: date) -> dict[str, Any]:
    payload = get_or_create_daily_plan(db, operation_date)
    consolidate_daily_points(db, payload["id"])
    db.flush()
    return get_daily_plan_by_date(db, operation_date)


def update_daily_plan_points(db: Session, daily_plan_id: int, final_point_ids: list[int]) -> dict[str, Any]:
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")
    if not final_point_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe incluir al menos un punto")
    plan.final_point_ids_json = _dump_json_list(final_point_ids)
    db.flush()
    return _daily_plan_payload(db, plan)


def mark_daily_plan_optimized(db: Session, daily_plan_id: int, simulation_id: int) -> None:
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        return
    plan.simulation_id = simulation_id
    plan.status = "optimized"
    db.flush()


def mark_daily_plan_dispatched(db: Session, daily_plan_id: int) -> None:
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        return
    plan.status = "dispatched"
    plan.dispatched_at = datetime.now(timezone.utc)
    db.flush()


def incorporate_pending_visit(db: Session, pending_id: int, target_date: date) -> dict[str, Any]:
    visit = db.get(PendingVisit, pending_id)
    if visit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pendiente no encontrado")
    if visit.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El pendiente ya fue procesado")
    visit.target_operation_date = target_date
    visit.status = "incorporated"
    db.flush()
    return _serialize_pending(db, visit)


def create_pending_visit(
    db: Session,
    *,
    collection_point_id: int,
    origin_operation_date: date,
    reason: str,
    source_waypoint_id: int | None = None,
    source_incident_id: int | None = None,
    target_operation_date: date | None = None,
    priority: int = 100,
) -> PendingVisit:
    existing = db.scalar(
        select(PendingVisit).where(
            PendingVisit.collection_point_id == collection_point_id,
            PendingVisit.origin_operation_date == origin_operation_date,
            PendingVisit.status == "open",
        )
    )
    if existing is not None:
        return existing

    point = db.get(CollectionPoint, collection_point_id)
    visit = PendingVisit(
        collection_point_id=collection_point_id,
        origin_operation_date=origin_operation_date,
        target_operation_date=target_operation_date,
        reason=reason,
        source_waypoint_id=source_waypoint_id,
        source_incident_id=source_incident_id,
        status="open",
        priority=compute_pending_priority(origin_operation_date, point),
    )
    db.add(visit)
    db.flush()
    return visit


def close_daily_plan(db: Session, daily_plan_id: int, *, user_id: int | None = None) -> dict[str, Any]:
    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")
    if plan.status in {"completed", "partial"} and plan.closed_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El plan del día ya fue cerrado")

    routes = db.scalars(
        select(OptimizedRoute)
        .where(OptimizedRoute.daily_plan_id == daily_plan_id)
        .options(joinedload(OptimizedRoute.waypoints))
    ).all()

    new_pending = 0
    for route in routes:
        for waypoint in route.waypoints:
            if waypoint.status not in {"pending", "skipped"}:
                continue
            create_pending_visit(
                db,
                collection_point_id=waypoint.collection_point_id,
                origin_operation_date=plan.operation_date,
                reason="skipped_breakdown" if waypoint.status == "skipped" else "not_visited",
                source_waypoint_id=waypoint.id,
                priority=100,
            )
            new_pending += 1

    plan.closed_at = datetime.now(timezone.utc)
    plan.status = "partial" if new_pending else "completed"
    _record_version(
        db,
        entity_type="daily_plan",
        entity_id=plan.id,
        snapshot=_daily_plan_payload(db, plan),
        summary=f"Cierre del día — {new_pending} pendiente(s) generado(s)",
        user_id=user_id,
    )
    db.flush()
    return {
        "closedAt": plan.closed_at.isoformat(),
        "newPendingVisits": new_pending,
        "status": plan.status,
    }


def seed_visit_schedules(db: Session, rows: list[dict[str, Any]]) -> None:
    for row in rows:
        point = db.scalar(select(CollectionPoint).where(CollectionPoint.code == row["pointCode"]))
        if point is None:
            continue
        existing = db.scalar(select(VisitSchedule).where(VisitSchedule.collection_point_id == point.id))
        if existing is not None:
            continue
        db.add(
            VisitSchedule(
                collection_point_id=point.id,
                visits_per_week=int(row.get("visitsPerWeek", 1)),
                weekdays_json=json.dumps(row.get("weekdays", [])),
                is_extra_visit=bool(row.get("isExtraVisit", False)),
                effective_from=date.fromisoformat(row["effectiveFrom"]),
                effective_until=date.fromisoformat(row["effectiveUntil"]) if row.get("effectiveUntil") else None,
            )
        )


def seed_weekly_plan_demo(db: Session, payload: dict[str, Any]) -> None:
    week_start = date.fromisoformat(payload["weekStartDate"])
    week_start, week_end = week_range(week_start)
    existing = db.scalar(select(WeeklyPlan).where(WeeklyPlan.week_start_date == week_start))
    if existing is not None:
        return

    plan = WeeklyPlan(
        week_start_date=week_start,
        week_end_date=week_end,
        status=payload.get("status", "approved"),
        scenario_id=payload.get("scenarioId", "normal"),
        notes=payload.get("notes"),
        approved_at=datetime.now(timezone.utc) if payload.get("status") == "approved" else None,
    )
    db.add(plan)
    db.flush()

    for day in payload.get("days", []):
        db.add(
            WeeklyPlanDay(
                weekly_plan_id=plan.id,
                operation_date=date.fromisoformat(day["operationDate"]),
                weekday=date.fromisoformat(day["operationDate"]).weekday(),
                sector_ids_json=_dump_json_list(day.get("sectorIds", [])),
                collection_point_ids_json=_dump_json_list(day.get("collectionPointIds", [])),
                expected_vehicle_count=day.get("expectedVehicleCount"),
            )
        )

    db.flush()


def seed_pending_visits_demo(db: Session, rows: list[dict[str, Any]]) -> None:
    yesterday = date.today() - timedelta(days=1)
    for row in rows:
        point = db.scalar(select(CollectionPoint).where(CollectionPoint.code == row["pointCode"]))
        if point is None:
            continue
        origin = date.fromisoformat(row.get("originOperationDate", yesterday.isoformat()))
        create_pending_visit(
            db,
            collection_point_id=point.id,
            origin_operation_date=origin,
            reason=row.get("reason", "not_visited"),
            priority=int(row.get("priority", 100)),
        )


def seed_daily_plan_demo(db: Session, payload: dict[str, Any]) -> None:
    operation_date = date.fromisoformat(payload["operationDate"])
    existing = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
    if existing is not None:
        return

    week_start, _ = week_range(operation_date)
    weekly_plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.week_start_date == week_start))
    scheduled_ids = resolve_scheduled_point_ids(db, operation_date)
    if not scheduled_ids:
        scheduled_ids = [int(value) for value in payload.get("scheduledPointIds", [])]

    db.add(
        DailyPlan(
            operation_date=operation_date,
            weekly_plan_id=weekly_plan.id if weekly_plan else None,
            status=payload.get("status", "draft"),
            scenario_id=payload.get("scenarioId", weekly_plan.scenario_id if weekly_plan else "normal"),
            scheduled_point_ids_json=_dump_json_list(scheduled_ids),
        )
    )


def autofill_weekly_plan_from_schedules(db: Session, plan_id: int) -> dict[str, Any]:
    from app.services.visit_schedule_service import list_active_visit_schedules

    plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.id == plan_id).options(joinedload(WeeklyPlan.days)))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    if plan.status == "approved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede autocompletar un plan aprobado")

    schedules = list_active_visit_schedules(db, reference=plan.week_start_date)
    if not schedules:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay frecuencias de visita configuradas")

    points_by_weekday: dict[int, list[int]] = {offset: [] for offset in range(7)}
    for row in schedules:
        point_id = row["collectionPointId"]
        for weekday in row["weekdays"]:
            if weekday in points_by_weekday and point_id not in points_by_weekday[weekday]:
                points_by_weekday[weekday].append(point_id)

    for day in list(plan.days):
        db.delete(day)
    db.flush()

    for offset in range(7):
        operation_date = plan.week_start_date + timedelta(days=offset)
        point_ids = sorted(points_by_weekday.get(offset, []))
        if not point_ids:
            continue
        fleet_estimate = max(1, min(4, (len(point_ids) + 11) // 12))
        db.add(
            WeeklyPlanDay(
                weekly_plan_id=plan.id,
                operation_date=operation_date,
                weekday=offset,
                collection_point_ids_json=_dump_json_list(point_ids),
                expected_vehicle_count=fleet_estimate,
            )
        )

    db.flush()
    snapshot = _weekly_plan_payload(plan)
    _record_version(db, entity_type="weekly_plan", entity_id=plan.id, snapshot=snapshot, summary="Autocompletado desde visit_schedules")
    return get_weekly_plan(db, plan.id)


def list_plan_versions(db: Session, *, entity_type: str, entity_id: int) -> list[dict[str, Any]]:
    versions = db.scalars(
        select(PlanVersion)
        .where(PlanVersion.entity_type == entity_type, PlanVersion.entity_id == entity_id)
        .order_by(PlanVersion.version_number.desc())
    ).all()
    return [
        {
            "id": version.id,
            "entityType": version.entity_type,
            "entityId": version.entity_id,
            "versionNumber": version.version_number,
            "changeSummary": version.change_summary,
            "createdAt": version.created_at.isoformat() if version.created_at else None,
            "snapshot": json.loads(version.snapshot_json),
        }
        for version in versions
    ]


def _diff_values(before: Any, after: Any, path: str = "") -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    if isinstance(before, dict) and isinstance(after, dict):
        keys = sorted(set(before.keys()) | set(after.keys()))
        for key in keys:
            child_path = f"{path}.{key}" if path else key
            if key not in before:
                changes.append({"path": child_path, "before": None, "after": after[key]})
            elif key not in after:
                changes.append({"path": child_path, "before": before[key], "after": None})
            else:
                changes.extend(_diff_values(before[key], after[key], child_path))
        return changes
    if isinstance(before, list) and isinstance(after, list):
        if before != after:
            changes.append({"path": path or "root", "before": before, "after": after})
        return changes
    if before != after:
        changes.append({"path": path or "root", "before": before, "after": after})
    return changes


def compare_plan_versions(db: Session, version_a_id: int, version_b_id: int) -> dict[str, Any]:
    version_a = db.get(PlanVersion, version_a_id)
    version_b = db.get(PlanVersion, version_b_id)
    if version_a is None or version_b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versión no encontrada")
    snapshot_a = json.loads(version_a.snapshot_json)
    snapshot_b = json.loads(version_b.snapshot_json)
    return {
        "versionA": version_a_id,
        "versionB": version_b_id,
        "changes": _diff_values(snapshot_a, snapshot_b),
    }


def cancel_pending_visit(db: Session, pending_id: int, *, reason: str | None = None) -> dict[str, Any]:
    visit = db.get(PendingVisit, pending_id)
    if visit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pendiente no encontrado")
    if visit.status not in {"open", "incorporated"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El pendiente ya fue cerrado")
    visit.status = "cancelled"
    visit.resolved_at = datetime.now(timezone.utc)
    db.flush()
    payload = _serialize_pending(db, visit)
    if reason:
        payload["cancelReason"] = reason
    return payload


def resolve_pending_visits_for_points(db: Session, point_ids: list[int], *, operation_date: date) -> int:
    if not point_ids:
        return 0
    visits = db.scalars(
        select(PendingVisit).where(
            PendingVisit.collection_point_id.in_(point_ids),
            PendingVisit.status.in_(["open", "incorporated"]),
        )
    ).all()
    resolved = 0
    now = datetime.now(timezone.utc)
    for visit in visits:
        visit.status = "resolved"
        visit.resolved_at = now
        if visit.target_operation_date is None:
            visit.target_operation_date = operation_date
        resolved += 1
    db.flush()
    return resolved


def list_operational_history(db: Session, *, limit: int = 25) -> list[dict[str, Any]]:
    from app.services.simulation_parsing import parse_simulation

    plans = db.scalars(
        select(DailyPlan)
        .where(DailyPlan.simulation_id.isnot(None))
        .order_by(DailyPlan.operation_date.desc(), DailyPlan.id.desc())
        .limit(limit)
    ).all()
    rows: list[dict[str, Any]] = []
    for plan in plans:
        if plan.simulation_id is None:
            continue
        simulation = db.get(Simulation, plan.simulation_id)
        if simulation is None:
            continue
        parsed = parse_simulation(simulation)
        final_ids = _json_list(plan.final_point_ids_json)
        scheduled_ids = _json_list(plan.scheduled_point_ids_json)
        point_count = len(final_ids) or len(scheduled_ids)
        rows.append(
            {
                "id": simulation.id,
                "dailyPlanId": plan.id,
                "operationDate": plan.operation_date.isoformat(),
                "status": plan.status,
                "pointCount": point_count,
                "distanceKm": float(parsed.get("distanceOptimizedKm") or 0),
                "name": f"Operación {plan.operation_date.isoformat()} — {parsed.get('scenarioName', 'Ruta')}",
                "datetime": simulation.executed_at.isoformat() if simulation.executed_at else None,
                "efficiency": float(simulation.kpi_saving_percentage or 0),
                "scenarioId": parsed.get("scenarioId", "normal"),
                "contingency": parsed.get("contingency", False),
            }
        )
    return rows


def archive_weekly_plan(db: Session, plan_id: int, *, user_id: int | None = None) -> dict[str, Any]:
    plan = db.scalar(select(WeeklyPlan).where(WeeklyPlan.id == plan_id).options(joinedload(WeeklyPlan.days)))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan semanal no encontrado")
    if plan.status == "archived":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El plan ya está archivado")
    if plan.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden archivar planes aprobados",
        )
    plan.status = "archived"
    _record_version(
        db,
        entity_type="weekly_plan",
        entity_id=plan.id,
        snapshot=_weekly_plan_payload(plan),
        summary="Plan semanal archivado",
        user_id=user_id,
    )
    db.flush()
    return get_weekly_plan(db, plan.id)


def trace_incident(db: Session, incident_id: int) -> dict[str, Any]:
    incident = db.scalar(
        select(VehicleIncident)
        .where(VehicleIncident.id == incident_id)
        .options(joinedload(VehicleIncident.vehicle), joinedload(VehicleIncident.route))
    )
    if incident is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incidencia no encontrada")

    pending_visits = db.scalars(
        select(PendingVisit)
        .where(PendingVisit.source_incident_id == incident_id)
        .options(joinedload(PendingVisit.collection_point))
        .order_by(PendingVisit.created_at)
    ).all()

    pending_payload = []
    for visit in pending_visits:
        target_date = visit.target_operation_date or (date.today() + timedelta(days=1))
        next_daily = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == target_date))
        pending_payload.append(
            {
                "pendingVisit": _serialize_pending(db, visit),
                "nextDailyPlan": _daily_plan_payload(db, next_daily) if next_daily else None,
                "targetOperationDate": target_date.isoformat(),
            }
        )

    return {
        "incident": {
            "id": incident.id,
            "incidentType": incident.incident_type,
            "description": incident.description,
            "reportedAt": incident.reported_at.isoformat() if incident.reported_at else None,
            "resolvedAt": incident.resolved_at.isoformat() if incident.resolved_at else None,
            "vehicleId": incident.vehicle.code if incident.vehicle else None,
            "routeId": incident.route_id,
        },
        "pendingVisits": pending_payload,
    }


def query_planning_history(
    db: Session,
    *,
    week_start: date | None = None,
    operation_date: date | None = None,
    incident_id: int | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    if incident_id is not None:
        return {"type": "incident_trace", "data": trace_incident(db, incident_id)}

    if operation_date is not None:
        daily = db.scalar(select(DailyPlan).where(DailyPlan.operation_date == operation_date))
        if daily is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan del día no encontrado")
        return {
            "type": "daily",
            "data": _daily_plan_payload(db, daily),
            "operationalRuns": list_operational_history(db, limit=10),
        }

    week_from = week_start
    week_to = week_start
    if week_start is not None:
        week_from, week_to = week_range(week_start)
    items = list_weekly_plans(db, week_from=week_from, week_to=week_to, limit=limit)
    return {"type": "weekly", "data": items}
