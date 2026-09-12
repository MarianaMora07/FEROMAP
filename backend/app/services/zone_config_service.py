"""Configuración por zona (parroquia): instalaciones y ventanas horarias (F8).

Reemplaza la asignación de ventanas por **paridad de sector** (legado, ver
`route_constraints.sector_time_window_secs`) por una ventana configurable en la
parroquia a la que pertenece el sector (ADR-008).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Parish, Sector
from app.domain.zone_window import window_offsets
from app.schemas.zone import ParishZoneUpdate


def parish_window_secs(parish: Parish) -> tuple[int, int] | None:
    """Ventana (inicio, fin) de la zona en segundos desde el inicio de jornada, o None."""
    return window_offsets(parish.time_window_start, parish.time_window_end)


def sector_windows(
    db: Session, sector_ids: Iterable[int | None]
) -> dict[int, tuple[int, int]]:
    """Ventanas por sector según la zona. Solo incluye sectores con ventana configurada."""
    ids = {sector_id for sector_id in sector_ids if sector_id is not None}
    if not ids:
        return {}
    rows = db.execute(
        select(Sector.id, Parish)
        .join(Parish, Sector.parish_id == Parish.id)
        .where(Sector.id.in_(ids), Sector.deleted_at.is_(None))
    ).all()
    windows: dict[int, tuple[int, int]] = {}
    for sector_id, parish in rows:
        window = parish_window_secs(parish)
        if window is not None:
            windows[sector_id] = window
    return windows


def parish_for_sectors(db: Session, sector_ids: Iterable[int | None]) -> int | None:
    """Id de parroquia si todos los sectores pertenecen a una sola; si no, None."""
    ids = {sector_id for sector_id in sector_ids if sector_id is not None}
    if not ids:
        return None
    parish_ids = db.scalars(select(Sector.parish_id).where(Sector.id.in_(ids))).all()
    unique = {parish_id for parish_id in parish_ids if parish_id is not None}
    if len(unique) == 1:
        return next(iter(unique))
    return None


def serialize_parish_zone(parish: Parish) -> dict[str, Any]:
    return {
        "id": parish.id,
        "name": parish.name,
        "city": parish.city,
        "depotLat": parish.depot_lat,
        "depotLon": parish.depot_lon,
        "landfillLat": parish.landfill_lat,
        "landfillLon": parish.landfill_lon,
        "timeWindowStart": parish.time_window_start,
        "timeWindowEnd": parish.time_window_end,
    }


def list_zones(db: Session) -> list[dict[str, Any]]:
    parishes = db.scalars(select(Parish).order_by(Parish.name)).all()
    return [serialize_parish_zone(parish) for parish in parishes]


def update_zone(db: Session, parish_id: int, payload: ParishZoneUpdate) -> dict[str, Any]:
    """Aplica un cambio parcial y valida la ventana resultante sobre el estado final."""
    parish = db.get(Parish, parish_id)
    if parish is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zona no encontrada",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(parish, field, value)

    if (
        parish.time_window_start is not None or parish.time_window_end is not None
    ) and parish_window_secs(parish) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Ventana horaria inválida: define inicio y fin en formato HH:MM, "
                "con inicio anterior al fin dentro de 06:00–18:00"
            ),
        )

    db.commit()
    db.refresh(parish)
    return serialize_parish_zone(parish)
