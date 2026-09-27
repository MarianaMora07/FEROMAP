"""Lectura de tiles raster desde archivo MBTiles (SQLite)."""

from __future__ import annotations

import math
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.config import settings
from app.services.graph_service import UNARE_BBOX

DEFAULT_MBTILES_NAME = "unare.mbtiles"
MIN_ZOOM = 12
MAX_ZOOM = 16


@dataclass(frozen=True)
class MbtilesMetadata:
    path: str
    available: bool
    min_zoom: int
    max_zoom: int
    bounds: tuple[float, float, float, float]
    tile_count: int
    attribution: str


def default_mbtiles_path() -> Path:
    return Path(settings.data_dir) / "tiles" / DEFAULT_MBTILES_NAME


def _xyz_to_tms_row(z: int, y: int) -> int:
    return (1 << z) - 1 - y


def _tile_in_unare_bounds(z: int, x: int, y: int) -> bool:
    min_lng, min_lat, max_lng, max_lat = UNARE_BBOX
    north = _tile_lat_lng_bounds(z, x, y)[0]
    south = _tile_lat_lng_bounds(z, x, y)[2]
    west = _tile_lat_lng_bounds(z, x, y)[1]
    east = _tile_lat_lng_bounds(z, x, y)[3]
    return not (east < min_lng or west > max_lng or south > max_lat or north < min_lat)


def _tile_lat_lng_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2.0**z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return north, west, south, east


def _resolved_mbtiles_path() -> Path:
    if settings.unare_mbtiles_path:
        return Path(settings.unare_mbtiles_path)
    return default_mbtiles_path()


def mbtiles_metadata(path: Path | None = None) -> MbtilesMetadata:
    target = path or _resolved_mbtiles_path()
    if not target.is_file():
        return MbtilesMetadata(
            path=str(target),
            available=False,
            min_zoom=MIN_ZOOM,
            max_zoom=MAX_ZOOM,
            bounds=UNARE_BBOX,
            tile_count=0,
            attribution="© OpenStreetMap contributors",
        )

    with sqlite3.connect(target) as conn:
        meta = {
            row[0]: row[1]
            for row in conn.execute("SELECT name, value FROM metadata").fetchall()
        }
        tile_count = conn.execute("SELECT COUNT(*) FROM tiles").fetchone()[0]

    min_zoom = int(float(meta.get("minzoom", MIN_ZOOM)))
    max_zoom = int(float(meta.get("maxzoom", MAX_ZOOM)))
    bounds_raw = meta.get("bounds")
    bounds = UNARE_BBOX
    if bounds_raw:
        parts = [float(value) for value in bounds_raw.split(",")]
        if len(parts) == 4:
            bounds = (parts[0], parts[1], parts[2], parts[3])

    return MbtilesMetadata(
        path=str(target),
        available=True,
        min_zoom=min_zoom,
        max_zoom=max_zoom,
        bounds=bounds,
        tile_count=int(tile_count),
        attribution=meta.get("attribution", "© OpenStreetMap contributors"),
    )


def read_mbtiles_tile(
    z: int,
    x: int,
    y: int,
    *,
    path: Path | None = None,
) -> bytes | None:
    if z < MIN_ZOOM or z > MAX_ZOOM:
        return None
    if not _tile_in_unare_bounds(z, x, y):
        return None

    target = path or _resolved_mbtiles_path()
    if not target.is_file():
        return None

    tms_row = _xyz_to_tms_row(z, y)
    with sqlite3.connect(target) as conn:
        row = conn.execute(
            """
            SELECT tile_data FROM tiles
            WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?
            """,
            (z, x, tms_row),
        ).fetchone()
    if row is None:
        return None
    return row[0]
