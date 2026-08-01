from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Vehicle
from app.services.seed_loader import load_seed

STATUS_TO_UI = {
    "in_route": "en-ruta",
    "available": "disponible",
    "maintenance": "mantenimiento",
    "inactive": "fuera-de-servicio",
}


def list_vehicles(db: Session) -> list[dict[str, Any]]:
    seed_rows = {row["code"]: row for row in load_seed("vehicles.json")}
    vehicles = db.scalars(select(Vehicle).order_by(Vehicle.code)).all()
    result = []
    for vehicle in vehicles:
        seed = seed_rows.get(vehicle.code, {})
        result.append(
            {
                "id": vehicle.code,
                "plate": vehicle.license_plate,
                "status": STATUS_TO_UI.get(vehicle.status, vehicle.status),
                "maxCapacityKg": float(vehicle.max_capacity_kg),
                "fuelConsumptionRate": float(vehicle.fuel_consumption_rate or 0),
                "driver": seed.get("driverName"),
                "driverPhone": seed.get("driverPhone"),
            }
        )
    return result


def list_alerts() -> list[dict[str, Any]]:
    return load_seed("alerts.json")


def monitoring_status(db: Session) -> dict[str, Any]:
    data = load_seed("monitoring.json")
    vehicles = db.scalars(select(Vehicle)).all()
    in_route = sum(1 for v in vehicles if v.status == "in_route")
    return {
        "kpis": data.get("kpis", []),
        "liveFleet": data.get("liveFleet", []),
        "fleetCounts": {
            "total": len(vehicles),
            "inRoute": in_route,
            "available": sum(1 for v in vehicles if v.status == "available"),
            "maintenance": sum(1 for v in vehicles if v.status == "maintenance"),
            "inactive": sum(1 for v in vehicles if v.status == "inactive"),
        },
    }
