"""Ajustes de sectores: reparto de la tasa de generación y factor de llenado."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CollectionPoint, Sector
from app.domain.criticality import is_critical_now
from app.domain.waste_generation import KG_PER_DAY, generation_rate_kg_per_day, overflow_kg
from app.services.geo_service import fill_level_pct

DISTRIBUTION_MODES = ("equal", "capacity", "population")
DEFAULT_DISTRIBUTION_MODE = "equal"


def _number(value: Any) -> float | None:
    """Convierte a float solo valores numéricos reales (tolerante a mocks/None)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    return None


def effective_zone_rate_kg_per_day(sector: Any) -> float | None:
    """Tasa total de la zona (kg/día): per cápita derivada o valor manual.

    Si hay ``per_capita_kg_per_day`` y población, la tasa se deriva como
    ``población × per cápita``; en caso contrario se usa la tasa manual.
    """
    per_capita = _number(getattr(sector, "per_capita_kg_per_day", None))
    population = _number(getattr(sector, "population", None))
    if per_capita is not None and per_capita > 0 and population and population > 0:
        return per_capita * population
    return _number(getattr(sector, "generation_rate_kg_per_day", None))


def _distribution_mode(sector: Any) -> str:
    mode = getattr(sector, "distribution_mode", None)
    return mode if mode in DISTRIBUTION_MODES else DEFAULT_DISTRIBUTION_MODE


def _distribution_weights(points: list[CollectionPoint], mode: str) -> list[float]:
    """Pesos del reparto; cae a capacidad y luego a iguales si faltan datos."""

    def capacity_weight(point: CollectionPoint) -> float:
        return max(0.0, _number(getattr(point, "max_capacity_kg", None)) or 0.0)

    def population_weight(point: CollectionPoint) -> float:
        return max(0.0, _number(getattr(point, "served_population", None)) or 0.0)

    if mode == "capacity":
        weights = [capacity_weight(point) for point in points]
    elif mode == "population":
        weights = [population_weight(point) for point in points]
    else:
        weights = [1.0 for _ in points]

    if sum(weights) <= 0:
        weights = [capacity_weight(point) for point in points]
    if sum(weights) <= 0:
        weights = [1.0 for _ in points]
    return weights


def serialize_sector(sector: Sector) -> dict[str, Any]:
    return {
        "id": sector.id,
        "name": sector.name,
        "fillRateFactor": float(getattr(sector, "fill_rate_factor", None) or 1.0),
        "population": (
            int(sector.population) if _number(getattr(sector, "population", None)) is not None else None
        ),
        "perCapitaKgPerDay": _number(getattr(sector, "per_capita_kg_per_day", None)),
        "distributionMode": _distribution_mode(sector),
        "configuredGenerationRateKgPerDay": _number(
            getattr(sector, "generation_rate_kg_per_day", None)
        ),
        "generationRateKgPerDay": effective_zone_rate_kg_per_day(sector),
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


def _active_points(db: Session, sector_id: int) -> list[CollectionPoint]:
    return list(
        db.scalars(
            select(CollectionPoint)
            .where(
                CollectionPoint.sector_id == sector_id,
                CollectionPoint.deleted_at.is_(None),
                CollectionPoint.status == "active",
            )
            .options(joinedload(CollectionPoint.sector))
        ).all()
    )


def distribute_sector_generation_rate(db: Session, sector: Sector) -> int:
    """Reparte la tasa de la zona entre sus contenedores activos.

    El reparto depende de ``distribution_mode``: igual para todos, proporcional a
    la capacidad, o proporcional a la población servida (con respaldos). Si la zona
    no define tasa, no toca los valores por contenedor. Devuelve cuántos se
    actualizaron.
    """
    total = effective_zone_rate_kg_per_day(sector)
    if total is None or total <= 0:
        return 0
    points = _active_points(db, sector.id)
    if not points:
        return 0

    weights = _distribution_weights(points, _distribution_mode(sector))
    denominator = sum(weights)
    total_decimal = Decimal(str(total))
    for point, weight in zip(points, weights):
        share = total_decimal * Decimal(str(weight)) / Decimal(str(denominator))
        point.generation_rate_kg_per_day = share.quantize(Decimal("0.01"))
    return len(points)


def update_sector_generation_config(
    db: Session,
    sector_id: int,
    payload: Any,
) -> dict[str, Any]:
    """Actualiza la configuración de generación de la zona y redistribuye.

    Campos (parciales): ``generation_rate_kg_per_day``, ``per_capita_kg_per_day`` y
    ``distribution_mode``. Enviar ``null`` limpia el valor.
    """
    data = payload.model_dump(exclude_unset=True)
    sector = db.get(Sector, sector_id)
    if sector is None or sector.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sector no encontrado",
        )

    if "generation_rate_kg_per_day" in data:
        raw_rate = data["generation_rate_kg_per_day"]
        sector.generation_rate_kg_per_day = (
            Decimal(str(raw_rate)) if raw_rate is not None else None
        )
    if "per_capita_kg_per_day" in data:
        raw_per_capita = data["per_capita_kg_per_day"]
        sector.per_capita_kg_per_day = (
            Decimal(str(raw_per_capita)) if raw_per_capita is not None else None
        )
    if "distribution_mode" in data and data["distribution_mode"] is not None:
        mode = data["distribution_mode"]
        if mode not in DISTRIBUTION_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"distribution_mode inválido: {mode}",
            )
        sector.distribution_mode = mode

    distributed = distribute_sector_generation_rate(db, sector)
    db.commit()
    db.refresh(sector)
    result = serialize_sector(sector)
    result["distributedContainerCount"] = distributed
    return result


def update_sector_generation_rate(
    db: Session, sector_id: int, rate_kg_per_day: float | None
) -> dict[str, Any]:
    """Compatibilidad: fija la tasa manual de la zona y redistribuye."""
    sector = db.get(Sector, sector_id)
    if sector is None or sector.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sector no encontrado",
        )
    sector.generation_rate_kg_per_day = (
        Decimal(str(rate_kg_per_day)) if rate_kg_per_day is not None else None
    )
    distributed = distribute_sector_generation_rate(db, sector)
    db.commit()
    db.refresh(sector)
    result = serialize_sector(sector)
    result["distributedContainerCount"] = distributed
    return result


def sectors_summary(db: Session) -> list[dict[str, Any]]:
    """Agregado por zona: contenedores, capacidad total, generación y rebose."""
    sectors = db.scalars(
        select(Sector).where(Sector.deleted_at.is_(None)).order_by(Sector.name)
    ).all()
    points = db.scalars(
        select(CollectionPoint)
        .where(CollectionPoint.deleted_at.is_(None), CollectionPoint.status == "active")
        .options(joinedload(CollectionPoint.sector))
    ).all()

    by_sector: dict[int, list[CollectionPoint]] = defaultdict(list)
    for point in points:
        by_sector[point.sector_id].append(point)

    rows: list[dict[str, Any]] = []
    for sector in sectors:
        bucket = by_sector.get(sector.id, [])
        total_capacity = sum(_number(point.max_capacity_kg) or 0.0 for point in bucket)
        total_rate_day = sum(generation_rate_kg_per_day(point) for point in bucket)
        critical = sum(1 for point in bucket if is_critical_now(fill_level_pct(point)))
        overflowing = sum(1 for point in bucket if overflow_kg(point) > 0)
        avg_fill = round(sum(fill_level_pct(point) for point in bucket) / len(bucket)) if bucket else 0
        rows.append(
            {
                "id": sector.id,
                "name": sector.name,
                "fillRateFactor": float(getattr(sector, "fill_rate_factor", None) or 1.0),
                "population": (
                    int(sector.population) if _number(getattr(sector, "population", None)) is not None else None
                ),
                "perCapitaKgPerDay": _number(getattr(sector, "per_capita_kg_per_day", None)),
                "distributionMode": _distribution_mode(sector),
                "configuredGenerationRateKgPerDay": _number(
                    getattr(sector, "generation_rate_kg_per_day", None)
                ),
                "generationRateKgPerDay": effective_zone_rate_kg_per_day(sector),
                "containerCount": len(bucket),
                "totalCapacityKg": round(total_capacity, 2),
                "effectiveGenerationRateKgPerDay": round(total_rate_day, 2),
                "effectiveGenerationRateKgPerHour": round(total_rate_day / KG_PER_DAY, 2),
                "avgFillPct": avg_fill,
                "criticalCount": critical,
                "overflowCount": overflowing,
            }
        )
    return rows
