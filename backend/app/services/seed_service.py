"""Pobla PostgreSQL desde data/seeds/*.json (generados con npm run export-seeds)."""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import hash_password
from app.db.models import (
    AlertActivity,
    CollectionPoint,
    DailyPlan,
    Driver,
    OptimizedRoute,
    Parish,
    PendingVisit,
    PlanVersion,
    RouteWaypoint,
    Sector,
    Simulation,
    SystemAlert,
    User,
    UserRole,
    Vehicle,
    VehicleIncident,
    VisitSchedule,
    WeeklyPlan,
    WeeklyPlanDay,
)
from app.db.session import SessionLocal
from app.services.admin_service import ensure_default_settings
from app.services.alert_service import seed_alerts_from_json
from app.services.planning_service import (
    seed_daily_plan_demo,
    seed_optimized_daily_playback_demo,
    seed_pending_visits_demo,
    seed_visit_schedules,
    seed_weekly_plan_demo,
    week_range,
)
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


def clear_tables(session: Session) -> None:
    session.execute(delete(PlanVersion))
    session.execute(delete(PendingVisit))
    session.execute(delete(DailyPlan))
    session.execute(delete(WeeklyPlanDay))
    session.execute(delete(WeeklyPlan))
    session.execute(delete(VisitSchedule))
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


def seed_into_session(session: Session) -> dict[str, Any]:
    parish_data = load_json("parish.json")
    sectors_data = load_json("sectors.json")
    points_data = load_json("collection_points.json")
    vehicles_data = load_json("vehicles.json")
    drivers_data = load_json("drivers.json")
    routes_data = load_json("routes.json")
    simulations_data = load_json("simulations.json")

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
    resident_sector = sector_by_name.get("Unare I", first_sector)

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
            sector_id=resident_sector.id,
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

    default_driver = driver_by_name.get(
        f"{conductor_row['firstName']} {conductor_row['lastName']}".strip()
    )

    vehicle_by_code: dict[str, Vehicle] = {}
    for row in vehicles_data:
        driver_name = row.get("driverName")
        default_driver_row = driver_by_name.get(driver_name) if driver_name else None
        vehicle_type = row.get("vehicleType", "Compactadora")
        if vehicle_type not in ("Volteo", "Compactadora"):
            vehicle_type = "Compactadora"
        vehicle = Vehicle(
            license_plate=row["licensePlate"],
            code=row["code"],
            vehicle_type=vehicle_type,
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

    try:
        visit_schedules_data = load_json("visit_schedules.json")
        seed_visit_schedules(session, visit_schedules_data)
    except FileNotFoundError:
        visit_schedules_data = []

    try:
        weekly_demo = load_json("weekly_plan_demo.json")
        week_start, _ = week_range(date.today())
        days = []
        for day in weekly_demo.get("days", []):
            operation_date = week_start + timedelta(days=int(day["weekdayOffset"]))
            point_codes = day.get("collectionPointCodes", [])
            point_ids = [
                point.id
                for point in collection_points
                if point.code in point_codes
            ]
            days.append(
                {
                    "operationDate": operation_date.isoformat(),
                    "collectionPointIds": point_ids,
                }
            )
        seed_weekly_plan_demo(
            session,
            {
                "weekStartDate": week_start.isoformat(),
                "status": weekly_demo.get("status", "approved"),
                "scenarioId": weekly_demo.get("scenarioId", "normal"),
                "notes": weekly_demo.get("notes"),
                "days": days,
            },
        )
        pending_rows = []
        for row in weekly_demo.get("pendingVisits", []):
            origin = date.today() - timedelta(days=int(row.get("daysAgo", 1)))
            pending_rows.append(
                {
                    "pointCode": row["pointCode"],
                    "originOperationDate": origin.isoformat(),
                    "reason": row.get("reason", "not_visited"),
                }
            )
        seed_pending_visits_demo(session, pending_rows)
        seed_daily_plan_demo(
            session,
            {
                "operationDate": date.today().isoformat(),
                "status": "draft",
            },
        )
        first_simulation = session.scalar(select(Simulation).order_by(Simulation.id).limit(1))
        if first_simulation is not None:
            seed_optimized_daily_playback_demo(
                session,
                operation_date=date.today(),
                simulation_id=first_simulation.id,
                vehicles=list(vehicle_by_code.values()),
                drivers=list(driver_by_name.values()),
                collection_points=collection_points,
            )
    except FileNotFoundError:
        pass

    session.commit()

    return {
        "parishes": 1,
        "sectors": len(sectors_data),
        "collectionPoints": len(collection_points),
        "vehicles": len(vehicles_data),
        "drivers": len(drivers_data),
        "users": 3 + len(drivers_data),
        "optimizedRoutes": len(routes_data),
        "simulations": len(simulations_data),
        "systemAlerts": alerts_count,
        "demoPassword": DEMO_PASSWORD,
    }


def run_seed() -> dict[str, Any]:
    with SessionLocal() as session:
        return seed_into_session(session)
