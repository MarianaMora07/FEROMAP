"""Genera collection points para sectores que no tienen."""

from __future__ import annotations

import logging
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.db.models import Sector, CollectionPoint

logger = logging.getLogger(__name__)

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


def generate_missing_collection_points(db: Session) -> dict[str, int]:
    """Crea 1 collection point por sector que no tenga ninguno."""
    sectors_without = db.scalars(
        select(Sector)
        .where(
            Sector.deleted_at.is_(None),
            ~Sector.id.in_(
                select(CollectionPoint.sector_id).where(CollectionPoint.deleted_at.is_(None))
            ),
        )
        .order_by(Sector.name)
    ).all()

    if not sectors_without:
        return {"created": 0, "total_points": _count_points(db)}

    existing_codes = set(
        db.scalars(select(CollectionPoint.code)).all()
    )
    max_id = db.scalar(select(func.max(CollectionPoint.id))) or 0

    created = 0
    for i, sector in enumerate(sectors_without):
        lat, lng = _SECTOR_COORDS.get(sector.name, (DEFAULT_LAT, DEFAULT_LNG))
        # Pequeña variación para evitarOverlap
        lat += (i % 5) * 0.0003
        lng += (i % 3) * 0.0004

        code = f"CNT-{max_id + created + 1:03d}"
        while code in existing_codes:
            max_id += 1
            code = f"CNT-{max_id + 1:03d}"
        existing_codes.add(code)

        point = CollectionPoint(
            sector_id=sector.id,
            code=code,
            latitude=lat,
            longitude=lng,
            max_capacity_kg=1000,
            current_fill_level_kg=0,
            status="active",
        )
        db.add(point)
        created += 1

    db.flush()
    logger.info("Created %d collection points for missing sectors", created)
    return {"created": created, "total_points": _count_points(db)}


def _count_points(db: Session) -> int:
    return db.scalar(
        select(func.count(CollectionPoint.id)).where(CollectionPoint.deleted_at.is_(None))
    ) or 0
