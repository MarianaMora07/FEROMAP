"""Genera collection points para cubrir sectores y alcanzar el total demo."""

from __future__ import annotations

import logging
from collections import Counter
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CollectionPoint, Sector
from app.domain.visit_schedule_distribution import (
    baseline_fill_hours,
    point_fill_rate_override,
)

logger = logging.getLogger(__name__)

# Total del catálogo demo: los puntos de data/seeds/collection_points.json + relleno
# automático repartido por sector. A jornada de 12 h el motor reparte ~30 puntos por
# camión, así que un catálogo mayor es lo que hace emerger más flota sin forzar la
# restricción `min_active_vehicles` (180 puntos -> ~6 camiones en la instancia completa).
TARGET_COLLECTION_POINTS = 180

# Coordenadas aproximadas por sector (zona Ciudad Guayana)
# Basadas en los puntos existentes y distribución geográfica conocida
_SECTOR_COORDS: dict[str, tuple[float, float]] = {
    "Terrazas del caroni A-B-C": (8.2900, -62.7200),
    "Terrazas del aluminio": (8.2880, -62.7180),
    "Villa Betania": (8.2850, -62.7300),
    "Mini fincas": (8.2820, -62.7400),
    "Villa Ikabaru": (8.2551, -62.8007),
    "Rio negro": (8.2650, -62.7750),
    "Los Bucares": (8.2680, -62.7700),
    "La Pastoreña": (8.2700, -62.7680),
    "Altos de Caroní": (8.2750, -62.7350),
    "Manuelita Saenz": (8.2770, -62.7380),
    "Las Mercedes": (8.2800, -62.7450),
    "Rio Aro": (8.2680, -62.7550),
    "Res Caroni plaza A-B-C-D": (8.2830, -62.7250),
    "Paratepuy": (8.2870, -62.7150),
    "Las Garzas": (8.2720, -62.7620),
    "Las Peonias": (8.2740, -62.7580),
    "Sierra Parima": (8.2600, -62.7800),
    "Unare I": (8.2784, -62.7516),
    "Villa Caroni": (8.2810, -62.7300),
    "El tiamo Country Club": (8.2830, -62.7320),
    "Isla Dorada": (8.2860, -62.7280),
    "Isla Coral": (8.2840, -62.7260),
    "Isla Bonita": (8.2850, -62.7240),
    "Villa Guayana": (8.2820, -62.7220),
    "Yuruani": (8.2620, -62.7780),
    "Rio Yocoima": (8.2640, -62.7760),
    "Uchire": (8.2771, -62.7562),
    "Curagua B": (8.2700, -62.7787),
    "Don Guillermo": (8.2690, -62.7800),
    "Caujaro": (8.2670, -62.7820),
    "Bloques de Curagua": (8.2710, -62.7790),
    "Villa Apso": (8.2720, -62.7770),
    "Las palmeras I y II": (8.2730, -62.7650),
    "Yara Yara I y II": (8.2750, -62.7630),
    "Guamo A-B-C": (8.2760, -62.7600),
    "Barrio Guayana": (8.2780, -62.7500),
    "El caimito 1-2-3-4": (8.2676, -62.7892),
    "Urb. Villa del Caroní": (8.2840, -62.7200),
    "Unare II": (8.2757, -62.7587),
    "UD 292": (8.2740, -62.7570),
    "Rio Cuyuní": (8.2700, -62.7500),
    "Ventuari": (8.2670, -62.7674),
    "Villa Yenisha": (8.2650, -62.7700),
    "Res. Atlantico Plaza": (8.2630, -62.7720),
    "Camino Real": (8.2610, -62.7740),
    "Lomas del caroni": (8.2890, -62.7120),
    "Los Rosales": (8.2910, -62.7100),
    "Villa Victoria": (8.2920, -62.7080),
    "Colegio Integral Guayana": (8.2895, -62.7160),
    "Urb. Sur Aeropuerto": (8.2860, -62.7100),
    "Res. Prasanthy country": (8.2845, -62.7140),
    "Rio Caura": (8.2693, -62.7611),
}

DEFAULT_LAT = 8.2750
DEFAULT_LNG = -62.7500


def ensure_collection_points_coverage(
    db: Session,
    *,
    target_total: int = TARGET_COLLECTION_POINTS,
) -> dict[str, int]:
    """Garantiza al menos 1 punto por sector y un total demo de `target_total`."""
    if target_total < 1:
        raise ValueError("target_total debe ser >= 1")

    created = 0
    existing_codes = set(db.scalars(select(CollectionPoint.code)).all())
    code_serial = _max_code_serial(existing_codes)

    sectors = db.scalars(
        select(Sector).where(Sector.deleted_at.is_(None)).order_by(Sector.name)
    ).all()
    if not sectors:
        return {"created": 0, "total_points": 0, "sectors_covered": 0}

    counts = _sector_point_counts(db)

    for sector in sectors:
        if counts.get(sector.id, 0) > 0:
            continue
        point, code_serial = _build_point_for_sector(
            sector=sector,
            index_in_sector=0,
            code_serial=code_serial,
            existing_codes=existing_codes,
        )
        db.add(point)
        counts[sector.id] = 1
        created += 1

    while _count_points(db) + created < target_total:
        sector = _sector_with_fewest_points(sectors, counts)
        index_in_sector = counts.get(sector.id, 0)
        point, code_serial = _build_point_for_sector(
            sector=sector,
            index_in_sector=index_in_sector,
            code_serial=code_serial,
            existing_codes=existing_codes,
        )
        db.add(point)
        counts[sector.id] = index_in_sector + 1
        created += 1

    if created:
        db.flush()
        logger.info(
            "Created %d collection points (target=%d, total=%d, sectors=%d)",
            created,
            target_total,
            _count_points(db),
            len(sectors),
        )

    return {
        "created": created,
        "total_points": _count_points(db),
        "sectors_covered": _count_sectors_with_points(db),
        "target_total": target_total,
    }


def generate_missing_collection_points(db: Session) -> dict[str, int]:
    """Compatibilidad con el endpoint demo: cubre sectores y llega al total del catálogo."""
    return ensure_collection_points_coverage(db)


def _build_point_for_sector(
    *,
    sector: Sector,
    index_in_sector: int,
    code_serial: int,
    existing_codes: set[str],
) -> tuple[CollectionPoint, int]:
    lat, lng = _SECTOR_COORDS.get(sector.name, (DEFAULT_LAT, DEFAULT_LNG))
    lat += (index_in_sector % 5) * 0.0003
    lng += (index_in_sector % 3) * 0.0004

    code_serial += 1
    code = f"CNT-{code_serial:03d}"
    while code in existing_codes:
        code_serial += 1
        code = f"CNT-{code_serial:03d}"
    existing_codes.add(code)

    fill_pct = Decimal(str(20 + ((code_serial * 13) % 55)))
    max_capacity_kg = Decimal("1000")
    # Horas base de llenado y override puntual coherentes con las frecuencias.
    estimated_fill_hours = Decimal(str(baseline_fill_hours(code)))
    override = point_fill_rate_override(code)

    return (
        CollectionPoint(
            sector_id=sector.id,
            code=code,
            latitude=Decimal(str(round(lat, 6))),
            longitude=Decimal(str(round(lng, 6))),
            max_capacity_kg=max_capacity_kg,
            current_fill_level_kg=(max_capacity_kg * fill_pct / Decimal("100")).quantize(
                Decimal("0.01")
            ),
            estimated_fill_hours=estimated_fill_hours,
            fill_rate_factor_override=Decimal(str(override)) if override is not None else None,
            status="active",
        ),
        code_serial,
    )


def _sector_with_fewest_points(
    sectors: list[Sector],
    counts: Counter[int],
) -> Sector:
    return min(sectors, key=lambda sector: (counts.get(sector.id, 0), sector.name))


def _sector_point_counts(db: Session) -> Counter[int]:
    rows = db.execute(
        select(CollectionPoint.sector_id, func.count(CollectionPoint.id))
        .where(CollectionPoint.deleted_at.is_(None))
        .group_by(CollectionPoint.sector_id)
    ).all()
    return Counter({sector_id: count for sector_id, count in rows})


def _max_code_serial(existing_codes: set[str]) -> int:
    serial = 0
    for code in existing_codes:
        if not code.startswith("CNT-"):
            continue
        suffix = code[4:]
        if suffix.isdigit():
            serial = max(serial, int(suffix))
    return serial


def _count_points(db: Session) -> int:
    return db.scalar(
        select(func.count(CollectionPoint.id)).where(CollectionPoint.deleted_at.is_(None))
    ) or 0


def _count_sectors_with_points(db: Session) -> int:
    return db.scalar(
        select(func.count(func.distinct(CollectionPoint.sector_id))).where(
            CollectionPoint.deleted_at.is_(None)
        )
    ) or 0
