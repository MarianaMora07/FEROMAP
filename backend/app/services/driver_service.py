from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password
from app.db.models import Driver, User, UserRole, Vehicle
from app.schemas.driver import Driver as DriverSchema, DriverCreate, DriverUpdate
from app.services.auth_service import get_user_by_email


def _serialize_driver(driver: Driver, *, assigned_vehicles: int = 0) -> DriverSchema:
    return DriverSchema(
        id=driver.id,
        document=driver.document,
        first_name=driver.first_name,
        last_name=driver.last_name,
        phone=driver.phone,
        email=driver.user.email if driver.user else None,
        active=driver.active,
        assigned_vehicles=assigned_vehicles,
    )


def _assigned_vehicle_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(Vehicle.default_driver_id, func.count())
        .where(Vehicle.default_driver_id.is_not(None))
        .group_by(Vehicle.default_driver_id)
    ).all()
    return {driver_id: count for driver_id, count in rows}


def list_drivers(db: Session) -> list[DriverSchema]:
    counts = _assigned_vehicle_counts(db)
    drivers = db.scalars(
        select(Driver)
        .where(Driver.deleted_at.is_(None))
        .options(joinedload(Driver.user))
        .order_by(Driver.last_name, Driver.first_name)
    ).unique().all()
    return [_serialize_driver(driver, assigned_vehicles=counts.get(driver.id, 0)) for driver in drivers]


def get_driver_by_id(db: Session, driver_id: int) -> Driver | None:
    return db.scalar(
        select(Driver)
        .where(Driver.id == driver_id, Driver.deleted_at.is_(None))
        .options(joinedload(Driver.user))
    )


def create_driver(db: Session, payload: DriverCreate) -> DriverSchema:
    email = payload.email.lower().strip()
    if get_user_by_email(db, email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El correo ya está registrado")

    existing_document = db.scalar(
        select(Driver).where(Driver.document == payload.document.strip(), Driver.deleted_at.is_(None))
    )
    if existing_document is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El documento ya está registrado")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        role=UserRole.conductor,
        active=True,
    )
    db.add(user)
    db.flush()

    driver = Driver(
        user_id=user.id,
        document=payload.document.strip(),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        active=True,
    )
    db.add(driver)
    db.flush()
    db.refresh(driver, attribute_names=["user"])
    return _serialize_driver(driver)


def update_driver(db: Session, driver_id: int, payload: DriverUpdate) -> DriverSchema:
    driver = get_driver_by_id(db, driver_id)
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conductor no encontrado")

    if payload.document is not None:
        document = payload.document.strip()
        existing = db.scalar(
            select(Driver).where(
                Driver.document == document,
                Driver.id != driver_id,
                Driver.deleted_at.is_(None),
            )
        )
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El documento ya está registrado")
        driver.document = document

    if payload.first_name is not None:
        driver.first_name = payload.first_name.strip()
        if driver.user:
            driver.user.first_name = driver.first_name
    if payload.last_name is not None:
        driver.last_name = payload.last_name.strip()
        if driver.user:
            driver.user.last_name = driver.last_name
    if payload.phone is not None:
        driver.phone = payload.phone.strip() or None
        if driver.user:
            driver.user.phone = driver.phone
    if payload.active is not None:
        driver.active = payload.active
        if driver.user:
            driver.user.active = payload.active

    db.flush()
    counts = _assigned_vehicle_counts(db)
    return _serialize_driver(driver, assigned_vehicles=counts.get(driver.id, 0))


def validate_driver_assignment(db: Session, driver_id: int) -> Driver:
    driver = get_driver_by_id(db, driver_id)
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conductor no encontrado")
    if not driver.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El conductor no está activo")
    return driver
