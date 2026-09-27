"""Gestión de contingencias operativas (averías en ruta → recálculo)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, DailyPlan, OptimizedRoute, RouteWaypoint, Simulation, SystemAlert, Vehicle, VehicleIncident
from app.domain.contingency_simulation import ContingencySimulationResult
from app.services.operations_service import dispatch_optimized_routes
from app.services.optimization_service import run_optimization_engine
from app.services.route_playback_service import route_features_to_playback_models

#: Rango de criticidad para el triage (mayor = más grave). Espeja los valores de
#: ``domain.criticality.CriticalityLevel``.
_CRITICALITY_RANK: dict[str, int] = {
    "critico": 4,
    "lleno": 3,
    "normal": 2,
    "parcial": 1,
    "fueraDeServicio": 0,
}


def _dropped_point_details(
    db: Session,
    point_ids: list[int],
    *,
    reason: str = "skipped_breakdown",
) -> list[dict[str, Any]]:
    """Triage de los puntos que quedarían sin atender, ordenado por criticidad.

    Reutiliza el modelo único de criticidad (ADR-002) y la prioridad de
    pendientes (``compute_pending_priority``), para que el descarte no sea
    "sin flota → todos pendientes" sino una decisión jerarquizada.
    """
    if not point_ids:
        return []
    from app.domain.criticality import evaluate_criticality
    from app.services.planning_service import compute_pending_priority

    points = db.scalars(select(CollectionPoint).where(CollectionPoint.id.in_(point_ids))).all()
    today = date.today()
    details: list[dict[str, Any]] = []
    for point in points:
        criticality = evaluate_criticality(point)
        details.append(
            {
                "code": str(point.code),
                "fillPct": int(criticality.fill_pct),
                "criticality": criticality.level.value,
                "priority": int(compute_pending_priority(today, point, reason=reason)),
            }
        )
    details.sort(
        key=lambda detail: (
            _CRITICALITY_RANK.get(str(detail["criticality"]), 0),
            int(detail["priority"]),
        ),
        reverse=True,
    )
    return details


def _alternative_routes_from_recalc(recalc: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Plan alternativo serializado a playback (vacío si el motor no recalculó)."""
    if not recalc:
        return []
    per_vehicle = recalc.get("routesPerVehicle") or {}
    return route_features_to_playback_models(per_vehicle.get("optimized") or [])


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
    *,
    allow_inactive: bool = False,
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

    route = db.scalar(
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
    if route is not None or not allow_inactive:
        return route

    # En simulación (dry-run) la avería debe guionarse aunque el día todavía no se
    # haya despachado (rutas ``pending``): el objetivo es validar el plan *antes*
    # de comprometerlo. El camino real (``handle_vehicle_breakdown``) sigue exigiendo
    # una ruta ``in_progress``, porque una avería real solo ocurre en ruta.
    return db.scalar(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.vehicle_id == vehicle.id,
            OptimizedRoute.status.in_(("pending", "in_progress")),
            OptimizedRoute.route_kind == "optimized",
        )
        .options(joinedload(OptimizedRoute.waypoints))
        .order_by(OptimizedRoute.id.desc())
        .limit(1)
    )


def _receiver_vehicle_codes(recalc: dict[str, Any]) -> list[str]:
    """Códigos de los vehículos que el motor usó para cubrir los puntos reasignados.

    El motor puede elegir unidades libres de la BD (no comprometidas en el día), así
    que el aviso debe nombrar a quien de hecho recibe los puntos en vez de asumir
    «la flota del día».
    """
    features = (recalc.get("routesPerVehicle") or {}).get("optimized") or []
    codes: list[str] = []
    for feature in features:
        properties = feature.get("properties") or {}
        code = properties.get("vehicleCode")
        if code and str(code) not in codes:
            codes.append(str(code))
    return codes


def _route_distance_km(route: OptimizedRoute | None) -> float | None:
    """Distancia planificada de una ruta en km (``None`` si no está calculada)."""
    if route is None or route.total_distance_meters is None:
        return None
    return float(route.total_distance_meters) / 1000.0


def _day_optimized_distance_km(db: Session, daily_plan_id: int | None) -> float | None:
    """Distancia total (km) de las rutas optimizadas vigentes del plan del día."""
    if daily_plan_id is None:
        return None
    distances = db.scalars(
        select(OptimizedRoute.total_distance_meters).where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status != "superseded",
        )
    ).all()
    values = [float(value) / 1000.0 for value in distances if value is not None]
    return sum(values) if values else None


def _day_fleet_vehicle_ids(
    db: Session,
    daily_plan_id: int | None,
    *,
    exclude_vehicle_id: int,
) -> list[int]:
    """Vehículos con ruta optimizada vigente en el plan del día (sin el averiado).

    Es la flota realmente comprometida en la jornada, a diferencia de los vehículos
    ``available`` de la BD (toda la flota), que confundían el aviso de reasignación.
    """
    if daily_plan_id is None:
        return []
    rows = db.scalars(
        select(OptimizedRoute.vehicle_id)
        .where(
            OptimizedRoute.daily_plan_id == daily_plan_id,
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.status != "superseded",
            OptimizedRoute.vehicle_id != exclude_vehicle_id,
        )
        .distinct()
    ).all()
    return [int(vehicle_id) for vehicle_id in rows]


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
    daily_plan_id: int | None = None,
) -> dict[str, Any]:
    """Reporta avería (real): interrumpe ruta, recalcula y **persiste** los cambios."""
    outcome = _run_vehicle_breakdown(
        db,
        vehicle_id=vehicle_id,
        route_id=route_id,
        description=description,
        dry_run=False,
        daily_plan_id=daily_plan_id,
    )
    db.commit()
    return outcome


def simulate_vehicle_breakdown(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None = None,
    description: str | None = None,
    daily_plan_id: int | None = None,
) -> dict[str, Any]:
    """Simula la avería **sin persistir**: calcula el plan alternativo y revierte la sesión."""
    try:
        return _run_vehicle_breakdown(
            db,
            vehicle_id=vehicle_id,
            route_id=route_id,
            description=description,
            dry_run=True,
            daily_plan_id=daily_plan_id,
        )
    finally:
        db.rollback()


def run_vehicle_breakdown_dry_run(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None = None,
    description: str | None = None,
    daily_plan_id: int | None = None,
) -> dict[str, Any]:
    """Avería dry-run **sin revertir**: muta la sesión para encadenar simulaciones.

    A diferencia de ``simulate_vehicle_breakdown``, no hace rollback; el llamador
    (la secuencia de simulación del día) es responsable de revertir al terminar.
    """
    return _run_vehicle_breakdown(
        db,
        vehicle_id=vehicle_id,
        route_id=route_id,
        description=description,
        dry_run=True,
        daily_plan_id=daily_plan_id,
    )


def _run_vehicle_breakdown(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None,
    description: str | None,
    dry_run: bool,
    daily_plan_id: int | None = None,
) -> dict[str, Any]:
    """Núcleo compartido: muta la sesión (incidente, waypoints, recálculo) sin commitear.

    El camino real (``handle_vehicle_breakdown``) confirma; el de simulación
    (``simulate_vehicle_breakdown``) revierte para no tocar las rutas reales.
    """
    vehicle = _resolve_vehicle(db, vehicle_id)
    route = _resolve_route(db, vehicle, route_id, allow_inactive=dry_run)
    # Plan del día al que pertenece la ruta averiada (para medir contra la jornada).
    day_plan_id = daily_plan_id or (route.daily_plan_id if route is not None else None)

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
                # Los waypoints de vertedero no tienen punto de recolección y no se
                # reasignan; incluirlos como ``None`` rompería al motor.
                if waypoint.collection_point_id is not None:
                    pending_point_ids.append(waypoint.collection_point_id)

    pending_point_ids = list(dict.fromkeys(pending_point_ids))

    if not pending_point_ids:
        return {
            "incident": _incident_payload(incident, vehicle, route, related_alert_id=related_alert_id),
            "skippedWaypoints": skipped_waypoints,
            "pendingPoints": 0,
            "recalculation": None,
            "alternativeRoutes": [],
            "resolution": "no_change",
            "droppedPoints": [],
            "droppedDetails": [],
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
        dropped_details = _dropped_point_details(db, pending_point_ids)
        for point_id in pending_point_ids:
            from app.services.planning_service import create_pending_visit

            create_pending_visit(
                db,
                collection_point_id=point_id,
                origin_operation_date=date.today(),
                reason="skipped_breakdown",
                source_incident_id=incident.id,
            )
        if not dry_run:
            # En simulación los pendientes solo viven en la sesión: el wrapper hace rollback.
            db.commit()
        return {
            "incident": _incident_payload(incident, vehicle, route, related_alert_id=related_alert_id),
            "skippedWaypoints": skipped_waypoints,
            "pendingPoints": len(pending_point_ids),
            "recalculation": None,
            "alternativeRoutes": [],
            "resolution": "pending",
            "droppedPoints": [detail["code"] for detail in dropped_details],
            "droppedDetails": dropped_details,
            "simulated": dry_run,
            "message": (
                "Avería registrada. Sin vehículos disponibles; puntos quedaron como pendientes."
                if not dry_run
                else "Simulación: sin vehículos disponibles; esos puntos quedarían pendientes."
            ),
        }

    before_km = _day_optimized_distance_km(db, day_plan_id)
    if before_km is None:
        # Sin rutas del día se usa la simulación padre como línea base.
        before_km = float(parent_simulation.kpi_total_distance_optimized or 0) if parent_simulation else 0.0
    day_fleet_vehicle_ids = _day_fleet_vehicle_ids(db, day_plan_id, exclude_vehicle_id=vehicle.id)
    reassign_target_count = len(day_fleet_vehicle_ids) if day_fleet_vehicle_ids else len(available_vehicles)

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
        include_per_vehicle_routes=True,
        # En contingencia, con flota justa, el ACO favorece contenedores críticos
        # (llenado >= 80%) y en riesgo de calendario (Fase 4 / ADR-003).
        priority_fill_level=True,
    )

    receiver_codes = _receiver_vehicle_codes(recalc)
    if receiver_codes:
        # Nombrar a los receptores reales evita el aviso engañoso «resto de la flota
        # del día» cuando el motor asignó los puntos a un vehículo libre de la BD.
        target_label = f"a {', '.join(receiver_codes)}"
        remaining_vehicles = len(receiver_codes)
    elif day_fleet_vehicle_ids:
        target_label = f"al resto de la flota del día ({reassign_target_count} vehículo(s))"
        remaining_vehicles = reassign_target_count
    else:
        target_label = f"a {reassign_target_count} vehículo(s) disponible(s)"
        remaining_vehicles = reassign_target_count

    after_subset_km = float(recalc["kpis"]["distanceKm"]["optimized"])
    broken_route_km = _route_distance_km(route)
    after_km: float | None
    distance_delta_km: float | None
    if broken_route_km is not None and before_km > 0:
        # «Después» comparable con el día completo: a las rutas intactas
        # (before − ruta averiada) se les suma el plan alternativo que cubre los
        # puntos reasignados. El recálculo solo optimiza esos puntos, así que sin
        # esta suma la cifra no sería comparable con la línea base de la jornada.
        after_km = round(before_km - broken_route_km + after_subset_km, 2)
        distance_delta_km = round(after_km - before_km, 2)
    else:
        # Sin distancia de la ruta averiada no hay base comparable: se expone el
        # subconjunto recalculado solo como dato informativo.
        after_km = None
        distance_delta_km = None
    recalc["comparison"] = {
        "parentSimulationId": parent_simulation.id if parent_simulation else None,
        "beforeDistanceKm": round(before_km, 2),
        "afterDistanceKm": after_km,
        "distanceDeltaKm": distance_delta_km,
        # Distancia del subconjunto recalculado (solo informativa, no comparable).
        "subsetDistanceKm": round(after_subset_km, 2),
        "remainingVehicles": remaining_vehicles,
        "reassignedPoints": len(pending_point_ids),
        "comparable": distance_delta_km is not None,
    }

    return {
        "incident": _incident_payload(incident, vehicle, route, related_alert_id=related_alert_id),
        "skippedWaypoints": skipped_waypoints,
        "pendingPoints": len(pending_point_ids),
        "recalculation": recalc,
        "comparison": recalc["comparison"],
        "alternativeRoutes": _alternative_routes_from_recalc(recalc),
        "resolution": "reassigned",
        "droppedPoints": [],
        "droppedDetails": [],
        "simulated": dry_run,
        "message": (
            f"Avería en {vehicle.code}: {len(pending_point_ids)} puntos reasignados "
            f"{target_label}."
            if not dry_run
            else f"Simulación de avería en {vehicle.code}: {len(pending_point_ids)} puntos "
            f"se reasignarían {target_label}."
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
) -> ContingencySimulationResult:
    """Simulación **dry-run** de una contingencia sobre el plan del día.

    Devuelve el plan alternativo (antes/después) sin persistir nada: el recálculo
    corre con ``auto_dispatch=False`` y la sesión se revierte al terminar. Incluye
    la geometría del plan alternativo por vehículo (``alternativeRoutes``) y cómo
    lo resolvió el motor (``resolution``/``droppedPoints``).
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
            # El recálculo reoptimiza el resto del día (no una ruta concreta), así que
            # no hay una línea base 1:1 comparable: se deja `before`/`delta` en ``None``.
            "beforeDistanceKm": None,
            "afterDistanceKm": round(float(after_km), 1) if after_km is not None else None,
            "distanceDeltaKm": None,
            "reassignedPoints": int(raw.get("remainingPoints") or 0),
            "remainingVehicles": None,
            "skippedWaypoints": 0,
            "alternativeRoutes": raw.get("alternativeRoutes") or [],
            "resolution": raw.get("resolution") or "no_change",
            "droppedPoints": raw.get("droppedPoints") or [],
            "droppedDetails": raw.get("droppedDetails") or [],
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
        daily_plan_id=daily_plan_id,
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
        "alternativeRoutes": raw.get("alternativeRoutes") or [],
        "resolution": raw.get("resolution") or "no_change",
        "droppedPoints": raw.get("droppedPoints") or [],
        "droppedDetails": raw.get("droppedDetails") or [],
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
