"""Reasignación equitativa y edición de territorios (sector→conductor)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CollectionPoint, Driver, Sector

logger = logging.getLogger(__name__)


def reassign_sectors(db: Session) -> dict[str, object]:
    """Distribuye todos los sectores entre conductores activos de forma equitativa.

    Estrategia: round-robin por ID de conductor sobre sectores ordenados por nombre.
    Si un conductor se desactiva o se agrega uno nuevo, se reasigna todo.
    """
    drivers = db.scalars(
        select(Driver).where(Driver.active.is_(True), Driver.deleted_at.is_(None)).order_by(Driver.id)
    ).all()

    if not drivers:
        return {"assigned": 0, "drivers": 0, "sectors": 0}

    sectors = db.scalars(
        select(Sector).where(Sector.deleted_at.is_(None)).order_by(Sector.name)
    ).all()

    for i, sector in enumerate(sectors):
        sector.driver_id = drivers[i % len(drivers)].id

    db.flush()

    logger.info("Reasigned %d sectors to %d drivers", len(sectors), len(drivers))
    return {
        "assigned": len(sectors),
        "drivers": len(drivers),
        "sectors": len(sectors),
    }


def get_sector_driver_summary(db: Session) -> list[dict]:
    """Retorna resumen de sectores por conductor."""
    rows = db.execute(
        select(
            Driver.id,
            Driver.first_name,
            Driver.last_name,
            func.count(Sector.id).label("sector_count"),
        )
        .outerjoin(Sector, Sector.driver_id == Driver.id)
        .where(Driver.active.is_(True), Driver.deleted_at.is_(None))
        .group_by(Driver.id, Driver.first_name, Driver.last_name)
        .order_by(Driver.id)
    ).all()

    return [
        {
            "driverId": r.id,
            "driverName": f"{r.first_name} {r.last_name}",
            "sectorCount": r.sector_count,
        }
        for r in rows
    ]


def list_sector_territories(db: Session) -> dict[str, Any]:
    """Sectores con contenedores activos y su conductor de preferencia actual."""
    rows = db.execute(
        select(
            Sector.id,
            Sector.name,
            Sector.driver_id,
            func.count(CollectionPoint.id).label("point_count"),
        )
        .outerjoin(
            CollectionPoint,
            (CollectionPoint.sector_id == Sector.id) & (CollectionPoint.deleted_at.is_(None)),
        )
        .where(Sector.deleted_at.is_(None))
        .group_by(Sector.id, Sector.name, Sector.driver_id)
        .order_by(Sector.name)
    ).all()
    driver_ids = {r.driver_id for r in rows if r.driver_id is not None}
    drivers: dict[int, str] = {}
    if driver_ids:
        driver_rows = db.scalars(
            select(Driver).where(Driver.id.in_(driver_ids), Driver.deleted_at.is_(None))
        ).all()
        drivers = {d.id: f"{d.first_name} {d.last_name}".strip() for d in driver_rows}
    return {
        "sectors": [
            {
                "sectorId": r.id,
                "name": r.name,
                "pointCount": int(r.point_count or 0),
                "driverId": r.driver_id,
                "driverName": drivers.get(r.driver_id) if r.driver_id else None,
            }
            for r in rows
        ]
    }


def set_driver_territory(
    db: Session,
    driver_id: int,
    sector_ids: list[int],
) -> dict[str, Any]:
    """Fija (reemplaza) los sectores de preferencia de un conductor.

    Un sector solo puede tener un conductor; si el sector estaba asignado a otro
    conductor se mueve al indicado. Los sectores que el conductor dejó de tener en la
    lista quedan sin asignar.
    """
    driver = db.scalar(
        select(Driver).where(Driver.id == driver_id, Driver.deleted_at.is_(None))
    )
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conductor no encontrado")
    if not driver.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El conductor no está activo; reactívalo antes de asignarle territorio",
        )

    target_ids = sorted({int(sector_id) for sector_id in sector_ids if int(sector_id) > 0})
    targets: list[Sector] = []
    if target_ids:
        targets = list(
            db.scalars(
                select(Sector).where(Sector.id.in_(target_ids), Sector.deleted_at.is_(None))
            ).all()
        )
        if len(targets) != len(target_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uno o más sectores no existen",
            )

    previous = list(
        db.scalars(
            select(Sector).where(Sector.driver_id == driver_id, Sector.deleted_at.is_(None))
        ).all()
    )
    for sector in previous:
        if sector.id not in target_ids:
            sector.driver_id = None
    for sector in targets:
        sector.driver_id = driver_id
    db.flush()

    logger.info(
        "Territorio de conductor %s actualizado a %d sectores",
        driver_id,
        len(target_ids),
    )
    return {
        "driverId": driver_id,
        "assignedSectorIds": target_ids,
        "count": len(target_ids),
    }
