"""Reasignación equitativa de sectores a conductores activos."""

from __future__ import annotations

import logging
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.models import Driver, Sector

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
