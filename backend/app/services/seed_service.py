"""Pobla PostgreSQL desde data/seeds/*.json (fuente de verdad del seed)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, date
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
    Parish,
    PendingVisit,
    PlanVersion,
    Sector,
    User,
    UserRole,
    Vehicle,
    VisitSchedule,
    WeeklyPlan,
    WeeklyPlanDay,
)
from app.db.session import SessionLocal
from app.domain.visit_schedule_distribution import (
    baseline_fill_hours,
    point_fill_rate_override,
    sector_fill_rate_factor,
)
from app.services.admin_service import ensure_default_settings
from app.services.case_study_seed_service import case_study_seed_summary, seed_case_studies
from app.services.collection_point_seed_service import ensure_collection_points_coverage
from app.services.visit_schedule_service import ensure_visit_schedules_coverage
from app.services.planning_service import (
    seed_daily_plan_demo,
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
        raise FileNotFoundError(f"No existe {path}. Revisa data/seeds/")
    return json.loads(path.read_text(encoding="utf-8"))


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def clear_tables(session: Session) -> None:
    from sqlalchemy import text
    session.execute(text("UPDATE users SET sector_id = NULL"))
    for tbl in [
        "driver_notifications", "user_preferences", "user_sessions",
        "plan_versions", "alert_activities", "system_alerts",
        "pending_visits", "vehicle_incidents", "route_waypoints",
        "visit_schedules", "optimized_routes", "daily_plans",
        "weekly_plan_days", "weekly_plans", "simulations",
        "case_study_points", "case_studies",
        "collection_points", "vehicles",
        "sectors",
        "drivers", "parishes", "users",
    ]:
        session.execute(text(f"DELETE FROM {tbl}"))
    session.commit()


def seed_into_session(session: Session) -> dict[str, Any]:
    parish_data = load_json("parish.json")
    sectors_data = load_json("sectors.json")
    points_data = load_json("collection_points.json")
    vehicles_data = load_json("vehicles.json")
    drivers_data = load_json("drivers.json")

    clear_tables(session)

    parish = Parish(name=parish_data["name"], city=parish_data.get("city", "Ciudad Guayana"))
    session.add(parish)
    session.flush()

    sector_by_name: dict[str, Sector] = {}
    for row in sectors_data:
        sector = Sector(
            parish_id=parish.id,
            name=row["name"],
            fill_rate_factor=Decimal(str(sector_fill_rate_factor(row["name"]))),
        )
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
    session.flush()

    collection_points: list[CollectionPoint] = []
    for row in points_data:
        sector = sector_by_name.get(row["sectorName"])
        if sector is None:
            raise ValueError(f"Sector desconocido: {row['sectorName']}")
        max_kg = Decimal(str(row["maxCapacityKg"]))
        fill_pct = Decimal(str(row["fillLevelPct"]))
        override = point_fill_rate_override(row["code"])
        point = CollectionPoint(
            sector_id=sector.id,
            code=row["code"],
            latitude=Decimal(str(row["latitude"])),
            longitude=Decimal(str(row["longitude"])),
            max_capacity_kg=max_kg,
            current_fill_level_kg=(max_kg * fill_pct / Decimal("100")).quantize(Decimal("0.01")),
            estimated_fill_hours=Decimal(str(baseline_fill_hours(row["code"]))),
            fill_rate_factor_override=Decimal(str(override)) if override is not None else None,
            status="active",
            last_emptied_at=parse_dt(row.get("lastCollection")),
        )
        session.add(point)
        collection_points.append(point)
    session.flush()

    coverage_stats = ensure_collection_points_coverage(session)
    collection_points = list(
        session.scalars(
            select(CollectionPoint)
            .where(CollectionPoint.deleted_at.is_(None))
            .order_by(CollectionPoint.code)
        ).all()
    )

    studies_by_code = seed_case_studies(session, collection_points=collection_points)
    case_study_stats = case_study_seed_summary(studies_by_code)

    # Seed limpio operativo: no se siembran rutas (ni en curso ni históricas), simulaciones,
    # alertas ni incidencias de vehículo. El dashboard arranca en 0 actividad y la operación
    # (o la demo) las genera en vivo.

    for user in session.scalars(select(User)).all():
        ensure_user_preferences(session, user)

    ensure_default_settings(session)

    try:
        visit_schedules_data = load_json("visit_schedules.json")
        seed_visit_schedules(session, visit_schedules_data)
        ensure_visit_schedules_coverage(session)
    except FileNotFoundError:
        visit_schedules_data = []

    try:
        weekly_demo = load_json("weekly_plan_demo.json")
        if weekly_demo.get("seedWeeklyPlan", False):
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
            if row.get("originOperationDate"):
                origin = date.fromisoformat(row["originOperationDate"])
            else:
                origin = date.today() - timedelta(days=int(row.get("daysAgo", 1)))
            pending_rows.append(
                {
                    "pointCode": row["pointCode"],
                    "originOperationDate": origin.isoformat(),
                    "reason": row.get("reason", "not_visited"),
                }
            )
        seed_pending_visits_demo(session, pending_rows)
        # El plan del día de hoy queda en borrador: la demo crea la semana y optimiza
        # el día en vivo. Sembrarlo "optimized" sin semana aprobada era incoherente.
        seed_daily_plan_demo(
            session,
            {
                "operationDate": date.today().isoformat(),
                "status": "draft",
            },
        )
    except FileNotFoundError:
        pass

    session.commit()

    return {
        "parishes": 1,
        "sectors": len(sectors_data),
        "collectionPoints": len(collection_points),
        "collectionPointsAutoCreated": coverage_stats["created"],
        "collectionPointsTargetTotal": coverage_stats["target_total"],
        "collectionPointsSectorsCovered": coverage_stats["sectors_covered"],
        "vehicles": len(vehicles_data),
        "drivers": len(drivers_data),
        "users": 3 + len(drivers_data),
        "optimizedRoutes": 0,
        "simulations": 0,
        "systemAlerts": 0,
        "demoPassword": DEMO_PASSWORD,
        **case_study_stats,
    }


def run_seed() -> dict[str, Any]:
    with SessionLocal() as session:
        return seed_into_session(session)
