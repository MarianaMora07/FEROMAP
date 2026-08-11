from __future__ import annotations

import csv
import io
from datetime import timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Driver, OptimizedRoute, Vehicle, VehicleIncident
from app.domain.crew_service_time import DEFAULT_IDEAL_OPERATORS, normalize_assigned_operators
from app.schemas.vehicle import VehicleUpdate
from app.services.driver_service import validate_driver_assignment

STATUS_TO_UI = {
    "in_route": "en-ruta",
    "available": "disponible",
    "maintenance": "mantenimiento",
    "inactive": "fuera-de-servicio",
}
UI_TO_STATUS = {ui: db for db, ui in STATUS_TO_UI.items()}

ASSIGNABLE_STATUSES = frozenset({"available", "in_route"})
ALLOWED_VEHICLE_STATUSES = frozenset({"available", "maintenance", "in_route", "inactive"})

DEFAULT_VEHICLE_IMAGE = (
    "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=480&h=320&q=80"
)
VEHICLE_TYPES = ("Compactador", "Volteo", "Recolector")


def _driver_display(driver: Driver | None) -> tuple[str | None, str | None]:
    if driver is None:
        return None, None
    return f"{driver.first_name} {driver.last_name}".strip(), driver.phone


def _resolve_driver(active_route: OptimizedRoute | None, vehicle: Vehicle) -> tuple[str | None, str | None]:
    if active_route is not None and active_route.driver is not None:
        return _driver_display(active_route.driver)
    if vehicle.default_driver is not None:
        return _driver_display(vehicle.default_driver)
    return None, None


def resolve_vehicle_driver_id(
    vehicle: Vehicle,
    *,
    active_route: OptimizedRoute | None = None,
) -> int | None:
    """Conductor efectivo: ruta activa primero, luego default_driver en BD."""
    if active_route is not None and active_route.driver_id is not None:
        return active_route.driver_id
    if vehicle.default_driver_id is not None:
        return vehicle.default_driver_id
    if vehicle.default_driver is not None:
        return vehicle.default_driver.id
    return None


def get_active_routes_by_vehicle_id(db: Session) -> dict[int, OptimizedRoute]:
    routes = db.scalars(
        select(OptimizedRoute)
        .where(OptimizedRoute.status == "in_progress")
        .options(
            joinedload(OptimizedRoute.driver),
            joinedload(OptimizedRoute.vehicle),
        )
        .order_by(OptimizedRoute.id.desc())
    ).unique().all()
    by_vehicle: dict[int, OptimizedRoute] = {}
    for route in routes:
        if route.vehicle_id not in by_vehicle:
            by_vehicle[route.vehicle_id] = route
    return by_vehicle


def _active_routes_by_vehicle(db: Session) -> dict[int, OptimizedRoute]:
    return get_active_routes_by_vehicle_id(db)


def _format_updated_at(vehicle: Vehicle) -> str:
    timestamp = vehicle.updated_at or vehicle.created_at
    if timestamp is None:
        return "—"
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M")


def resolve_vehicle_assigned_operators(vehicle: Vehicle) -> int:
    """Dotación efectiva hoy; null en BD = dotación completa (ideal)."""
    ideal = vehicle.ideal_operators_count or DEFAULT_IDEAL_OPERATORS
    return normalize_assigned_operators(vehicle.assigned_operators_count, ideal=ideal)


def _serialize_vehicle(
    vehicle: Vehicle,
    *,
    index: int,
    active_route: OptimizedRoute | None = None,
) -> dict[str, Any]:
    capacity_m3 = float(vehicle.max_capacity_kg) / 1000
    driver_name, driver_phone = _resolve_driver(active_route, vehicle)
    effective_driver_id = resolve_vehicle_driver_id(vehicle, active_route=active_route)
    current_route: str | None = None
    if vehicle.status == "in_route" and active_route is not None:
        current_route = f"Ruta optimizada {vehicle.code}"

    payload: dict[str, Any] = {
        "id": vehicle.code,
        "plate": vehicle.license_plate,
        "status": STATUS_TO_UI.get(vehicle.status, vehicle.status),
        "maxCapacityKg": float(vehicle.max_capacity_kg),
        "fuelConsumptionRate": float(vehicle.fuel_consumption_rate or 0),
        "driver": driver_name,
        "driverPhone": driver_phone,
        "defaultDriverId": vehicle.default_driver_id,
        "driverId": effective_driver_id,
        "type": VEHICLE_TYPES[index % len(VEHICLE_TYPES)],
        "fuelPct": None,
        "capacityPct": None,
        "capacityM3": capacity_m3,
        "model": "Camión de recolección",
        "year": 2020 + (index % 5),
        "mileageKm": 12000 + index * 1500,
        "base": "Base Unare",
        "updatedAt": _format_updated_at(vehicle),
        "image": DEFAULT_VEHICLE_IMAGE,
        "idealOperatorsCount": vehicle.ideal_operators_count,
        "assignedOperatorsCount": vehicle.assigned_operators_count,
        "effectiveAssignedOperatorsCount": resolve_vehicle_assigned_operators(vehicle),
        "currentRoute": current_route,
    }
    if active_route is not None:
        payload["activeRouteId"] = active_route.id
    return payload


def list_vehicles(db: Session) -> list[dict[str, Any]]:
    vehicles = db.scalars(
        select(Vehicle).options(joinedload(Vehicle.default_driver)).order_by(Vehicle.code)
    ).unique().all()
    active_routes = _active_routes_by_vehicle(db)
    return [
        _serialize_vehicle(
            vehicle,
            index=index,
            active_route=active_routes.get(vehicle.id),
        )
        for index, vehicle in enumerate(vehicles)
    ]


def build_summary_from_vehicles(
    vehicles: list[Vehicle],
    *,
    active_routes: dict[int, OptimizedRoute] | None = None,
) -> dict[str, Any]:
    by_status = {ui: 0 for ui in STATUS_TO_UI.values()}
    assignable = 0
    routes = active_routes or {}
    for vehicle in vehicles:
        ui_status = STATUS_TO_UI.get(vehicle.status, vehicle.status)
        by_status[ui_status] = by_status.get(ui_status, 0) + 1
        if vehicle.status in ASSIGNABLE_STATUSES and resolve_vehicle_driver_id(
            vehicle,
            active_route=routes.get(vehicle.id),
        ):
            assignable += 1
    return {
        "total": len(vehicles),
        "assignableCount": assignable,
        "byStatus": by_status,
    }


def vehicles_summary(db: Session) -> dict[str, Any]:
    vehicles = db.scalars(
        select(Vehicle).options(joinedload(Vehicle.default_driver))
    ).unique().all()
    active_routes = get_active_routes_by_vehicle_id(db)
    return build_summary_from_vehicles(vehicles, active_routes=active_routes)


def vehicle_detail(db: Session, code: str) -> dict[str, Any]:
    vehicle = db.scalar(
        select(Vehicle)
        .where(Vehicle.code == code)
        .options(joinedload(Vehicle.default_driver))
    )
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"Vehículo {code} no encontrado")

    vehicles = db.scalars(select(Vehicle).order_by(Vehicle.code)).all()
    index = next((i for i, row in enumerate(vehicles) if row.id == vehicle.id), 0)
    active_routes = _active_routes_by_vehicle(db)
    return _serialize_vehicle(vehicle, index=index, active_route=active_routes.get(vehicle.id))


def _get_vehicle_by_code(db: Session, code: str) -> Vehicle:
    vehicle = db.scalar(
        select(Vehicle)
        .where(Vehicle.code == code)
        .options(joinedload(Vehicle.default_driver))
    )
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"Vehículo {code} no encontrado")
    return vehicle


def update_vehicle(db: Session, code: str, payload: VehicleUpdate) -> dict[str, Any]:
    vehicle = _get_vehicle_by_code(db, code)
    data = payload.model_dump(exclude_unset=True)

    if "status" in data and data["status"] is not None:
        next_status = data["status"]
        if next_status not in ALLOWED_VEHICLE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Estado de vehículo inválido: {next_status}",
            )
        vehicle.status = next_status

    if "default_driver_id" in payload.model_fields_set:
        driver_id = data.get("default_driver_id")
        if driver_id is None:
            vehicle.default_driver_id = None
        else:
            validate_driver_assignment(db, driver_id)
            vehicle.default_driver_id = driver_id

    if "assigned_operators_count" in payload.model_fields_set:
        ideal = vehicle.ideal_operators_count or DEFAULT_IDEAL_OPERATORS
        assigned = data.get("assigned_operators_count")
        if assigned is None:
            vehicle.assigned_operators_count = None
        else:
            if assigned < 1 or assigned > ideal:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"assignedOperatorsCount debe estar entre 1 y {ideal} (dotación ideal del vehículo).",
                )
            vehicle.assigned_operators_count = assigned

    db.flush()
    return vehicle_detail(db, code)


def _last_optimization_vehicle_codes(db: Session) -> tuple[set[str], Any]:
    latest_calculated = db.scalar(
        select(OptimizedRoute.calculated_at)
        .where(OptimizedRoute.route_kind == "optimized")
        .order_by(OptimizedRoute.calculated_at.desc())
        .limit(1)
    )
    if latest_calculated is None:
        return set(), None

    routes = db.scalars(
        select(OptimizedRoute)
        .where(
            OptimizedRoute.route_kind == "optimized",
            OptimizedRoute.calculated_at == latest_calculated,
        )
        .options(joinedload(OptimizedRoute.vehicle))
    ).all()

    codes: set[str] = set()
    for route in routes:
        if route.vehicle is not None:
            codes.add(route.vehicle.code)
    return codes, latest_calculated


def vehicles_optimization_context(db: Session) -> dict[str, Any]:
    last_codes, last_at = _last_optimization_vehicle_codes(db)
    return {
        "lastOptimizedCodes": sorted(last_codes),
        "lastOptimizedAt": last_at.isoformat() if last_at else None,
    }


def filter_vehicle_rows(
    rows: list[dict[str, Any]],
    *,
    status: str | None = None,
    assignable_only: bool = False,
    q: str | None = None,
) -> list[dict[str, Any]]:
    query = q.strip().lower() if q else ""
    filtered: list[dict[str, Any]] = []
    for row in rows:
        row_status = row.get("status")
        if assignable_only and row_status not in {STATUS_TO_UI[s] for s in ASSIGNABLE_STATUSES}:
            continue
        if status and row_status != status:
            continue
        if query:
            haystack = " ".join(
                str(row.get(field, "") or "")
                for field in ("id", "plate", "driver", "type")
            ).lower()
            if query not in haystack:
                continue
        filtered.append(row)
    return filtered


def export_vehicles_csv(
    db: Session,
    *,
    status: str | None = None,
    assignable_only: bool = False,
    q: str | None = None,
) -> str:
    rows = filter_vehicle_rows(
        list_vehicles(db),
        status=status,
        assignable_only=assignable_only,
        q=q,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "plate",
            "status",
            "type",
            "driver",
            "driver_phone",
            "max_capacity_kg",
            "current_route",
            "updated_at",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.get("id"),
                row.get("plate"),
                row.get("status"),
                row.get("type"),
                row.get("driver") or "",
                row.get("driverPhone") or "",
                row.get("maxCapacityKg"),
                row.get("currentRoute") or "",
                row.get("updatedAt") or "",
            ]
        )
    return buffer.getvalue()


def _format_incident_timestamp(value: Any) -> str:
    if value is None:
        return "—"
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M")


def _serialize_incident(incident: VehicleIncident) -> dict[str, Any]:
    return {
        "id": incident.id,
        "incidentType": incident.incident_type,
        "description": incident.description,
        "reportedAt": incident.reported_at.isoformat() if incident.reported_at else None,
        "resolvedAt": incident.resolved_at.isoformat() if incident.resolved_at else None,
        "affectsActiveRoute": incident.affects_active_route,
        "routeId": incident.route_id,
        "status": "resuelto" if incident.resolved_at is not None else "activo",
    }


def vehicle_maintenance_history(db: Session, code: str, *, limit: int = 20) -> list[dict[str, Any]]:
    vehicle = _get_vehicle_by_code(db, code)
    incidents = db.scalars(
        select(VehicleIncident)
        .where(VehicleIncident.vehicle_id == vehicle.id)
        .order_by(VehicleIncident.reported_at.desc())
        .limit(limit)
    ).all()
    return [_serialize_incident(incident) for incident in incidents]
