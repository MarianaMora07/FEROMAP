"""Gestión de contingencias operativas (averías en ruta → recálculo)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, OptimizedRoute, RouteWaypoint, Simulation, Vehicle, VehicleIncident
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


def handle_vehicle_breakdown(
    db: Session,
    *,
    vehicle_id: str,
    route_id: int | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Reporta avería, interrumpe ruta y relanza optimización con flota restante."""
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
        db.commit()
        return {
            "incident": _incident_payload(incident, vehicle, route),
            "skippedWaypoints": skipped_waypoints,
            "pendingPoints": 0,
            "recalculation": None,
            "message": "Avería registrada. No había paradas pendientes para recalcular.",
        }

    available_vehicles = db.scalars(
        select(Vehicle).where(
            Vehicle.status == "available",
            Vehicle.id != vehicle.id,
        )
    ).all()
    if not available_vehicles:
        db.commit()
        return {
            "incident": _incident_payload(incident, vehicle, route),
            "skippedWaypoints": skipped_waypoints,
            "pendingPoints": len(pending_point_ids),
            "recalculation": None,
            "message": "Avería registrada. Sin vehículos disponibles para recálculo inmediato.",
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
        auto_dispatch=True,
        auto_commit=False,
    )

    db.commit()

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
        "incident": _incident_payload(incident, vehicle, route),
        "skippedWaypoints": skipped_waypoints,
        "pendingPoints": len(pending_point_ids),
        "recalculation": recalc,
        "comparison": recalc["comparison"],
        "message": (
            f"Avería en {vehicle.code}: {len(pending_point_ids)} puntos reasignados "
            f"a {len(available_vehicles)} vehículo(s) disponible(s)."
        ),
    }


def _incident_payload(
    incident: VehicleIncident,
    vehicle: Vehicle,
    route: OptimizedRoute | None,
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
    }


def list_recent_incidents(db: Session, limit: int = 10) -> list[dict[str, Any]]:
    incidents = db.scalars(
        select(VehicleIncident)
        .options(joinedload(VehicleIncident.vehicle), joinedload(VehicleIncident.route))
        .order_by(VehicleIncident.reported_at.desc())
        .limit(limit)
    ).all()
    return [
        _incident_payload(incident, incident.vehicle, incident.route)
        for incident in incidents
        if incident.vehicle is not None
    ]
