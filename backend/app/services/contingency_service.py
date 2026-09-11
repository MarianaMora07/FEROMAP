"""Gestión de contingencias operativas (averías en ruta → recálculo)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, DailyPlan, OptimizedRoute, RouteWaypoint, Simulation, SystemAlert, Vehicle, VehicleIncident
from app.services.operations_service import dispatch_optimized_routes
from app.services.optimization_service import run_optimization_engine


def _resolve_vehicle(db: Session, vehicle_id: str) -> Vehicle:
    if vehicle_id.isdigit():
        vehicle = db.get(Vehicle, int(vehicle_id))
        if vehicle is not None:
            return vehicle
    vehicle = db.scalar(select(Vehicle).where(Vehicle.code == vehicle_id))
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehículo no encontrado: {vehicle_id}",
        )
    return vehicle


def _resolve_route(
    db: Session,
    vehicle: Vehicle,
    route_id: int | None,
) -> OptimizedRoute | None:
    if route_id is not None:
        route = db.scalar(
            select(OptimizedRoute)
            .where(OptimizedRoute.id == route_id, OptimizedRoute.vehicle_id == vehicle.id)
            .options(joinedload(OptimizedRoute.waypoints))
        )
        if route is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ruta no encontrada para el vehículo {vehicle.code}",
            )
        return route

    return db.scalar(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.vehicle_id == vehicle.id,
            OptimizedRoute.status == "in_progress",
            OptimizedRoute.route_kind == "optimized",
        )
        .options(joinedload(OptimizedRoute.waypoints))
        .order_by(OptimizedRoute.id.desc())
        .limit(1)
    )


def _latest_simulation(db: Session) -> Simulation | None:
    return db.scalars(select(Simulation).order_by(Simulation.executed_at.desc()).limit(1)).first()


def _create_incident_alert(db: Session, incident: VehicleIncident, vehicle: Vehicle) -> str:
    alert_id = f"al-inc-{incident.id}"
    existing = db.get(SystemAlert, alert_id)
    if existing is not None:
        return alert_id

    db.add(
        SystemAlert(
            id=alert_id,
            source_key=f"incident-{incident.id}",
            priority="advertencia",
            title=f"Avería reportada — {vehicle.code}",
            detail=incident.description or f"Incidencia #{incident.id} en campo",
            source=f"Vehículo {vehicle.code}",
            location="Operación en campo",
            category="mantenimiento",
            longitude=-62.715,
            latitude=8.295,
            lifecycle_status="open",
            occurred_at=incident.reported_at or datetime.now(timezone.utc),
        )
    )
    return alert_id


def handle_vehicle_breakdown(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Reporta avería (real): interrumpe ruta, recalcula y **persiste** los cambios."""
    outcome = _run_vehicle_breakdown(
        db, vehicle_id=vehicle_id, route_id=route_id, description=description, dry_run=False
    )
    db.commit()
    return outcome


def simulate_vehicle_breakdown(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Simula la avería **sin persistir**: calcula el plan alternativo y revierte la sesión."""
    try:
        return _run_vehicle_breakdown(
            db, vehicle_id=vehicle_id, route_id=route_id, description=description, dry_run=True
        )
    finally:
        db.rollback()


def _run_vehicle_breakdown(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None,
    description: str | None,
    dry_run: bool,
) -> dict[str, Any]:
    """Núcleo compartido: muta la sesión (incidente, waypoints, recálculo) sin commitear.

    El camino real (``handle_vehicle_breakdown``) confirma; el de simulación
    (``simulate_vehicle_breakdown``) revierte para no tocar las rutas reales.
    """
    vehicle = _resolve_vehicle(db, vehicle_id)
    route = _resolve_route(db, vehicle, route_id)

    if vehicle.status == "maintenance":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El vehículo {vehicle.code} ya está en mantenimiento",
        )

    parent_simulation = _latest_simulation(db)
    parent_params: dict[str, Any] = {}
    if parent_simulation and parent_simulation.parameters_json:
        parent_params = json.loads(parent_simulation.parameters_json)

    pending_point_ids: list[int] = []
    skipped_waypoints = 0

    incident = VehicleIncident(
        vehicle_id=vehicle.id,
        route_id=route.id if route else None,
        incident_type="breakdown",
        description=description or f"Avería reportada en vehículo {vehicle.code}",
        affects_active_route=route is not None,
    )
    db.add(incident)
    db.flush()
    related_alert_id = _create_incident_alert(db, incident, vehicle)

    vehicle.status = "maintenance"

    if route is not None:
        route.status = "interrupted"
        for waypoint in route.waypoints:
            if waypoint.status == "pending":
                waypoint.status = "skipped"
                skipped_waypoints += 1
                pending_point_ids.append(waypoint.collection_point_id)

    pending_point_ids = list(dict.fromkeys(pending_point_ids))

    if not pending_point_ids:
        return {
            "incident": _incident_payload(incident, vehicle, route, related_alert_id=related_alert_id),
            "skippedWaypoints": skipped_waypoints,
            "pendingPoints": 0,
            "recalculation": None,
            "simulated": dry_run,
            "message": "Avería registrada. No había paradas pendientes para recalcular.",
        }

    available_vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.status == "available",
            Vehicle.id != vehicle.id,
        )
    ).all()
    if not available_vehicles:
        for point_id in pending_point_ids:
            from app.services.planning_service import create_pending_visit

            create_pending_visit(
                db,
                collection_point_id=point_id,
                origin_operation_date=date.today(),
                reason="skipped_breakdown",
                source_incident_id=incident.id,
                priority=120,
            )
        db.commit()
        return {
            "incident": _incident_payload(incident, vehicle, route, related_alert_id=related_alert_id),
            "skippedWaypoints": skipped_waypoints,
            "pendingPoints": len(pending_point_ids),
            "recalculation": None,
            "simulated": dry_run,
            "message": (
                "Avería registrada. Sin vehículos disponibles; puntos quedaron como pendientes."
                if not dry_run
                else "Simulación: sin vehículos disponibles; esos puntos quedarían pendientes."
            ),
        }

    before_km = float(parent_simulation.kpi_total_distance_optimized or 0) if parent_simulation else 0

    recalc = run_optimization_engine(
        db,
        "broken_vehicle",
        collection_point_ids=pending_point_ids,
        exclude_vehicle_ids=[vehicle.id],
        contingency_meta={
            "incidentId": incident.id,
            "parentSimulationId": parent_simulation.id if parent_simulation else None,
            "brokenVehicleCode": vehicle.code,
            "brokenVehicleId": vehicle.id,
            "interruptedRouteId": route.id if route else None,
            "pendingPointsCount": len(pending_point_ids),
            "skippedWaypoints": skipped_waypoints,
            "beforeDistanceKm": before_km,
        },
        auto_dispatch=not dry_run,
        planning_level="operational",
        auto_commit=False,
    )

    after_km = recalc["kpis"]["distanceKm"]["optimized"]
    recalc["comparison"] = {
        "parentSimulationId": parent_simulation.id if parent_simulation else None,
        "beforeDistanceKm": before_km,
        "afterDistanceKm": after_km,
        "distanceDeltaKm": round(after_km - before_km, 2),
        "remainingVehicles": len(available_vehicles),
        "reassignedPoints": len(pending_point_ids),
    }

    return {
        "incident": _incident_payload(incident, vehicle, route, related_alert_id=related_alert_id),
        "skippedWaypoints": skipped_waypoints,
        "pendingPoints": len(pending_point_ids),
        "recalculation": recalc,
        "comparison": recalc["comparison"],
        "simulated": dry_run,
        "message": (
            f"Avería en {vehicle.code}: {len(pending_point_ids)} puntos reasignados "
            f"a {len(available_vehicles)} vehículo(s) disponible(s)."
            if not dry_run
            else f"Simulación de avería en {vehicle.code}: {len(pending_point_ids)} puntos "
            f"se reasignarían a {len(available_vehicles)} vehículo(s)."
        ),
    }


def _pick_plan_vehicle_code(db: Session, daily_plan_id: int) -> str | None:
    """Primer vehículo con ruta optimizada del plan del día (para simular la avería)."""
    route = db.scalar(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
        )
        .order_by(OptimizedRoute.id)
        .limit(1)
    )
    if route is None:
        return None
    vehicle = db.get(Vehicle, route.vehicle_id)
    return vehicle.code if vehicle else None


def _pick_critical_point_code(db: Session, daily_plan_id: int) -> str | None:
    """Punto programado del día con mayor llenado (para simular contenedor crítico)."""
    from app.services.geo_service import fill_level_pct
    from app.services.operational_recalc_service import collect_remaining_day_point_ids

    point_ids = collect_remaining_day_point_ids(db, daily_plan_id)
    if not point_ids:
        return None
    points = db.scalars(select(CollectionPoint).where(CollectionPoint.id.in_(point_ids))).all()
    if not points:
        return None
    best = max(points, key=lambda point: fill_level_pct(point))
    return best.code


def simulate_daily_contingency(
    db: Session,
    *,
    daily_plan_id: int,
    contingency_type: str,
    vehicle_id: str | None = None,
    collection_point_code: str | None = None,
) -> dict[str, Any]:
    """Simulación **dry-run** de una contingencia sobre el plan del día.

    Devuelve el plan alternativo (antes/después) sin persistir nada: el recálculo
    corre con ``auto_dispatch=False`` y la sesión se revierte al terminar.
    """
    from app.services.operational_recalc_service import simulate_critical_container_recalc

    plan = db.get(DailyPlan, daily_plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan del día no encontrado",
        )

    if contingency_type == "critical_container":
        point_code = collection_point_code or _pick_critical_point_code(db, daily_plan_id)
        if not point_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay puntos pendientes en el día para simular el contenedor crítico",
            )
        raw = simulate_critical_container_recalc(
            db,
            collection_point_code=point_code,
            daily_plan_id=daily_plan_id,
        )
        recalc = raw.get("recalculation") or {}
        kpis = recalc.get("kpis") or {}
        after_km = (kpis.get("distanceKm") or {}).get("optimized")
        return {
            "type": "critical_container",
            "simulated": True,
            "dailyPlanId": plan.id,
            "vehicleId": None,
            "pointCode": point_code,
            "beforeDistanceKm": None,
            "afterDistanceKm": round(float(after_km), 1) if after_km is not None else None,
            "distanceDeltaKm": None,
            "reassignedPoints": int(raw.get("remainingPoints") or 0),
            "remainingVehicles": None,
            "skippedWaypoints": 0,
            "message": raw.get("message") or "Simulación de contenedor crítico completada.",
        }

    if contingency_type != "breakdown":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de contingencia no soportado: {contingency_type}",
        )

    vehicle_code = vehicle_id or _pick_plan_vehicle_code(db, daily_plan_id)
    if not vehicle_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay rutas con vehículo en el día para simular la avería",
        )
    raw = simulate_vehicle_breakdown(
        db,
        vehicle_id=vehicle_code,
        description="Simulación de avería (dry-run)",
    )
    comparison = raw.get("comparison") or {}
    return {
        "type": "breakdown",
        "simulated": True,
        "dailyPlanId": plan.id,
        "vehicleId": vehicle_code,
        "pointCode": None,
        "beforeDistanceKm": comparison.get("beforeDistanceKm"),
        "afterDistanceKm": comparison.get("afterDistanceKm"),
        "distanceDeltaKm": comparison.get("distanceDeltaKm"),
        "reassignedPoints": int(raw.get("pendingPoints") or 0),
        "remainingVehicles": comparison.get("remainingVehicles"),
        "skippedWaypoints": int(raw.get("skippedWaypoints") or 0),
        "message": raw.get("message") or "Simulación de avería completada.",
    }


def _incident_payload(
    incident: VehicleIncident,
    vehicle: Vehicle,
    route: OptimizedRoute | None,
    *,
    related_alert_id: str | None = None,
) -> dict[str, Any]:
    return {
        "id": incident.id,
        "vehicleId": vehicle.code,
        "vehicleDbId": vehicle.id,
        "routeId": route.id if route else None,
        "incidentType": incident.incident_type,
        "description": incident.description,
        "reportedAt": incident.reported_at.isoformat() if incident.reported_at else None,
        "affectsActiveRoute": incident.affects_active_route,
        "relatedAlertId": related_alert_id or f"al-inc-{incident.id}",
    }


def list_recent_incidents(
    db: Session,
    *,
    limit: int = 10,
    vehicle_id: str | None = None,
    hours: int | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        select(VehicleIncident)
        .options(joinedload(VehicleIncident.vehicle), joinedload(VehicleIncident.route))
        .order_by(VehicleIncident.reported_at.desc())
    )
    if hours is not None:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        stmt = stmt.where(VehicleIncident.reported_at >= since)
    incidents = db.scalars(stmt.limit(limit * 3 if vehicle_id else limit)).all()

    items: list[dict[str, Any]] = []
    for incident in incidents:
        if incident.vehicle is None:
            continue
        if vehicle_id and incident.vehicle.code != vehicle_id:
            continue
        items.append(_incident_payload(incident, incident.vehicle, incident.route))
        if len(items) >= limit:
            break
    return items
