"""Pobla PostgreSQL desde data/seeds/*.json (generados con npm run export-seeds)."""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, select

from app.config import settings
from app.core.security import hash_password
from app.db.models import (
    AlertActivity,
    CollectionPoint,
    Driver,
    OptimizedRoute,
    Parish,
    RouteWaypoint,
    Sector,
    Simulation,
    SystemAlert,
    User,
    UserPreferences,
    UserRole,
    Vehicle,
    VehicleIncident,
)
from app.db.session import SessionLocal
from app.services.alert_service import seed_alerts_from_json
from app.services.admin_service import ensure_default_settings
from app.services.profile_service import ensure_user_preferences

SEEDS_DIR = Path(settings.data_dir) / "seeds"
DEMO_PASSWORD = "123456789"
DEMO_PASSWORD_HASH = hash_password(DEMO_PASSWORD)


def load_json(name: str):
    path = SEEDS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"No existe {path}. Ejecuta: npm run export-seeds")
    return json.loads(path.read_text(encoding="utf-8"))


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def nearest_collection_point_id(
    lng: float, lat: float, points: list[CollectionPoint]
) -> int | None:
    best_id: int | None = None
    best_dist = math.inf
    for point in points:
        dist = (float(point.longitude) - lng) ** 2 + (float(point.latitude) - lat) ** 2
        if dist < best_dist:
            best_dist = dist
            best_id = point.id
    return best_id


def clear_tables(session) -> None:
    session.execute(delete(AlertActivity))
    session.execute(delete(SystemAlert))
    session.execute(delete(RouteWaypoint))
    session.execute(delete(VehicleIncident))
    session.execute(delete(OptimizedRoute))
    session.execute(delete(Simulation))
    session.execute(delete(CollectionPoint))
    session.execute(delete(Vehicle))
    session.execute(delete(Driver))
    session.execute(delete(User))
    session.execute(delete(Sector))
    session.execute(delete(Parish))
    session.commit()


def seed() -> None:
    parish_data = load_json("parish.json")
    sectors_data = load_json("sectors.json")
    points_data = load_json("collection_points.json")
    vehicles_data = load_json("vehicles.json")
    drivers_data = load_json("drivers.json")
    routes_data = load_json("routes.json")
    simulations_data = load_json("simulations.json")

    with SessionLocal() as session:
        clear_tables(session)

        parish = Parish(name=parish_data["name"], city=parish_data.get("city", "Ciudad Guayana"))
        session.add(parish)
        session.flush()

        sector_by_name: dict[str, Sector] = {}
        for row in sectors_data:
            sector = Sector(parish_id=parish.id, name=row["name"])
            session.add(sector)
            sector_by_name[row["name"]] = sector
        session.flush()

        first_sector = next(iter(sector_by_name.values()))

        session.add(
            User(
                email="admin@fero.com",
                password_hash=DEMO_PASSWORD_HASH,
                first_name="Mariana",
                last_name="Mora",
                phone="+58 412-555-0198",
                role=UserRole.administrador,
                active=True,
            )
        )
        session.add(
            User(
                email="plan@fero.com",
                password_hash=DEMO_PASSWORD_HASH,
                first_name="Víctor",
                last_name="Astudillo",
                phone="+58 414-555-0100",
                role=UserRole.planificador,
                active=True,
            )
        )
        session.add(
            User(
                email="residente@fero.com",
                password_hash=DEMO_PASSWORD_HASH,
                first_name="Carlos",
                last_name="Residente",
                phone="+58 424-555-0200",
                role=UserRole.residente,
                sector_id=first_sector.id,
                active=True,
            )
        )
        conductor_row = drivers_data[0]
        conductor_user = User(
            email="conductor@fero.com",
            password_hash=DEMO_PASSWORD_HASH,
            first_name=conductor_row["firstName"],
            last_name=conductor_row["lastName"],
            phone=conductor_row.get("phone"),
            role=UserRole.conductor,
            active=True,
        )
        session.add(conductor_user)
        session.flush()

        driver_by_name: dict[str, Driver] = {}
        for index, row in enumerate(drivers_data):
            if index == 0:
                user = conductor_user
            else:
                user = User(
                    email=f"{row['slug'].lower()}@fero.com",
                    password_hash=DEMO_PASSWORD_HASH,
                    first_name=row["firstName"],
                    last_name=row["lastName"],
                    phone=row.get("phone"),
                    role=UserRole.conductor,
                    active=True,
                )
                session.add(user)
                session.flush()
            driver = Driver(
                user_id=user.id,
                document=row["document"],
                first_name=row["firstName"],
                last_name=row["lastName"],
                phone=row.get("phone"),
                active=True,
            )
            session.add(driver)
            full_name = f"{row['firstName']} {row['lastName']}".strip()
            driver_by_name[full_name] = driver
        session.flush()

        default_driver = driver_by_name.get(f"{conductor_row['firstName']} {conductor_row['lastName']}".strip())

        vehicle_by_code: dict[str, Vehicle] = {}
        for row in vehicles_data:
            driver_name = row.get("driverName")
            default_driver_row = driver_by_name.get(driver_name) if driver_name else None
            vehicle = Vehicle(
                license_plate=row["licensePlate"],
                code=row["code"],
                max_capacity_kg=Decimal(str(row["maxCapacityKg"])),
                fuel_consumption_rate=Decimal(str(row.get("fuelConsumptionRate", 0.35))),
                ideal_operators_count=int(row.get("idealOperatorsCount", 6)),
                assigned_operators_count=row.get("assignedOperatorsCount"),
                default_driver_id=default_driver_row.id if default_driver_row else None,
                status=row.get("status", "available"),
            )
            session.add(vehicle)
            vehicle_by_code[row["code"]] = vehicle
        session.flush()

        collection_points: list[CollectionPoint] = []
        for row in points_data:
            sector = sector_by_name.get(row["sectorName"])
            if sector is None:
                raise ValueError(f"Sector desconocido: {row['sectorName']}")
            max_kg = Decimal(str(row["maxCapacityKg"]))
            fill_pct = Decimal(str(row["fillLevelPct"]))
            point = CollectionPoint(
                sector_id=sector.id,
                code=row["code"],
                latitude=Decimal(str(row["latitude"])),
                longitude=Decimal(str(row["longitude"])),
                max_capacity_kg=max_kg,
                current_fill_level_kg=(max_kg * fill_pct / Decimal("100")).quantize(Decimal("0.01")),
                status="active",
                last_emptied_at=parse_dt(row.get("lastCollection")),
            )
            session.add(point)
            collection_points.append(point)
        session.flush()

        active_route_points = collection_points[:12]
        for vehicle in vehicle_by_code.values():
            if vehicle.status != "in_route" or vehicle.default_driver_id is None:
                continue
            route = OptimizedRoute(
                vehicle_id=vehicle.id,
                driver_id=vehicle.default_driver_id,
                route_kind="optimized",
                total_distance_meters=Decimal("12500"),
                estimated_duration_seconds=90 * 60,
                status="in_progress",
            )
            session.add(route)
            session.flush()

            for sequence, point in enumerate(active_route_points[:3], start=1):
                session.add(
                    RouteWaypoint(
                        route_id=route.id,
                        collection_point_id=point.id,
                        sequence_order=sequence,
                        status="completed" if sequence == 1 else "pending",
                    )
                )

        for route_row in routes_data:
            fallback_vehicle = session.scalar(select(Vehicle).limit(1))
            if fallback_vehicle is None or default_driver is None:
                raise RuntimeError("Se requiere al menos un vehículo y un conductor para rutas históricas")

            route = OptimizedRoute(
                vehicle_id=fallback_vehicle.id,
                driver_id=default_driver.id,
                route_kind=route_row.get("kind", "optimized"),
                total_distance_meters=Decimal(str(route_row["distanceKm"])) * Decimal("1000"),
                estimated_duration_seconds=int(route_row["durationMin"]) * 60,
                status="completed",
            )
            session.add(route)
            session.flush()

            seen_points: set[int] = set()
            sequence = 1
            for coord in route_row.get("coordinates", []):
                if not isinstance(coord, list) or len(coord) < 2:
                    continue
                lng, lat = float(coord[0]), float(coord[1])
                point_id = nearest_collection_point_id(lng, lat, collection_points)
                if point_id is None or point_id in seen_points:
                    continue
                seen_points.add(point_id)
                session.add(
                    RouteWaypoint(
                        route_id=route.id,
                        collection_point_id=point_id,
                        sequence_order=sequence,
                        status="completed",
                    )
                )
                sequence += 1

        maintenance_vehicle = vehicle_by_code.get("TR-07")
        if maintenance_vehicle is not None:
            session.add(
                VehicleIncident(
                    vehicle_id=maintenance_vehicle.id,
                    incident_type="scheduled_maintenance",
                    description="Revisión programada de frenos y sistema hidráulico.",
                    affects_active_route=False,
                )
            )
            session.add(
                VehicleIncident(
                    vehicle_id=maintenance_vehicle.id,
                    incident_type="preventive_service",
                    description="Cambio de aceite y filtros completado.",
                    affects_active_route=False,
                    resolved_at=datetime.now(timezone.utc),
                )
            )

        broken_vehicle = vehicle_by_code.get("TR-19")
        if broken_vehicle is not None:
            session.add(
                VehicleIncident(
                    vehicle_id=broken_vehicle.id,
                    incident_type="breakdown",
                    description="Falla en transmisión reportada durante ruta.",
                    affects_active_route=True,
                )
            )

        for index, row in enumerate(simulations_data):
            executed_at = datetime.now(timezone.utc) - timedelta(days=len(simulations_data) - index)
            session.add(
                Simulation(
                    scenario_name=row["scenarioName"],
                    executed_at=executed_at,
                    parameters_json=json.dumps(row.get("parameters", {}), ensure_ascii=False),
                    kpi_total_distance_historical=Decimal(str(row["kpiTotalDistanceHistorical"])),
                    kpi_total_distance_optimized=Decimal(str(row["kpiTotalDistanceOptimized"])),
                    kpi_saving_percentage=Decimal(str(row["kpiSavingPercentage"])),
                )
            )

        alerts_count = seed_alerts_from_json(session)

        for user in session.scalars(select(User)).all():
            ensure_user_preferences(session, user)

        ensure_default_settings(session)

        session.commit()

        sectors_count = len(sectors_data)
        points_count = len(collection_points)
        vehicles_count = len(vehicles_data)
        drivers_count = len(drivers_data)
        users_count = 3 + drivers_count

        print("✅ Seed completado")
        print(f"   parishes: 1")
        print(f"   sectors: {sectors_count}")
        print(f"   collection_points: {points_count}")
        print(f"   vehicles: {vehicles_count}")
        print(f"   drivers: {drivers_count}")
        print(f"   users: {users_count}")
        print("   credenciales demo: admin@fero.com | plan@fero.com | residente@fero.com | conductor@fero.com")
        print(f"   clave demo: {DEMO_PASSWORD}")
        print(f"   optimized_routes: {len(routes_data)}")
        print(f"   simulations: {len(simulations_data)}")
        print(f"   system_alerts: {alerts_count}")


if __name__ == "__main__":
    seed()
