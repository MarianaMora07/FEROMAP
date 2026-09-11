"""Ajustes de sectores: factor de velocidad de llenado de la zona."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Sector


def serialize_sector(sector: Sector) -> dict[str, Any]:
    return {
        "id": sector.id,
        "name": sector.name,
        "fillRateFactor": float(getattr(sector, "fill_rate_factor", None) or 1.0),
    }


def list_sectors_with_fill_rate(db: Session) -> list[dict[str, Any]]:
    sectors = db.scalars(
        select(Sector).where(Sector.deleted_at.is_(None)).order_by(Sector.name)
    ).all()
    return [serialize_sector(sector) for sector in sectors]


def update_sector_fill_rate_factor(db: Session, sector_id: int, factor: float) -> dict[str, Any]:
    """Actualiza el factor de llenado de la zona (> 1 = se llena más rápido)."""
    sector = db.get(Sector, sector_id)
    if sector is None or sector.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sector no encontrado",
        )
    sector.fill_rate_factor = Decimal(str(factor))
    db.commit()
    db.refresh(sector)
    return serialize_sector(sector)
