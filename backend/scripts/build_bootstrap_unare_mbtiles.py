#!/usr/bin/env python3
"""Genera MBTiles raster de Unare descargando tiles OSM una sola vez (bootstrap offline)."""

from __future__ import annotations

import argparse
import math
import sqlite3
import time
import urllib.error
import urllib.request
from pathlib import Path

UNARE_BBOX = (-62.81, 8.24, -62.69, 8.31)
DEFAULT_MIN_ZOOM = 12
DEFAULT_MAX_ZOOM = 16
TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
USER_AGENT = "FEROMAP-MBTiles-Bootstrap/1.0 (thesis; one-time local cache)"


def deg2num(lat_deg: float, lon_deg: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat_deg)
    n = 2.0**zoom
    x = int((lon_deg + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_range_for_bbox(
    bbox: tuple[float, float, float, float],
    zoom: int,
) -> tuple[range, range]:
    min_lng, min_lat, max_lng, max_lat = bbox
    x_min, y_max = deg2num(min_lat, min_lng, zoom)
    x_max, y_min = deg2num(max_lat, max_lng, zoom)
    return range(x_min, x_max + 1), range(y_min, y_max + 1)


def xyz_to_tms_row(z: int, y: int) -> int:
    return (1 << z) - 1 - y


def fetch_tile(z: int, x: int, y: int, retries: int = 3) -> bytes | None:
    url = TILE_URL.format(z=z, x=x, y=y)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if attempt == retries - 1:
                raise
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
        time.sleep(0.5 * (attempt + 1))
    return None


def create_mbtiles(
    output_path: Path,
    *,
    min_zoom: int,
    max_zoom: int,
    bbox: tuple[float, float, float, float],
) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    min_lng, min_lat, max_lng, max_lat = bbox
    inserted = 0

    with sqlite3.connect(output_path) as conn:
        conn.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
        conn.execute(
            "CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)"
        )
        conn.executemany(
            "INSERT INTO metadata (name, value) VALUES (?, ?)",
            [
                ("name", "FEROMAP Unare"),
                ("format", "png"),
                ("bounds", f"{min_lng},{min_lat},{max_lng},{max_lat}"),
                ("minzoom", str(min_zoom)),
                ("maxzoom", str(max_zoom)),
                ("type", "baselayer"),
                ("attribution", "© OpenStreetMap contributors"),
            ],
        )

        for zoom in range(min_zoom, max_zoom + 1):
            x_range, y_range = tile_range_for_bbox(bbox, zoom)
            for x in x_range:
                for y in y_range:
                    tile_data = fetch_tile(zoom, x, y)
                    if not tile_data:
                        continue
                    conn.execute(
                        """
                        INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data)
                        VALUES (?, ?, ?, ?)
                        """,
                        (zoom, x, xyz_to_tms_row(zoom, y), tile_data),
                    )
                    inserted += 1
                    if inserted % 25 == 0:
                        print(f"  · {inserted} tiles (z{zoom}, x{x}, y{y})")
                    time.sleep(0.05)

        conn.commit()

    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap MBTiles Unare para FEROMAP")
    parser.add_argument(
        "--output",
        default="data/tiles/unare.mbtiles",
        help="Ruta de salida del archivo .mbtiles",
    )
    parser.add_argument("--min-zoom", type=int, default=DEFAULT_MIN_ZOOM)
    parser.add_argument("--max-zoom", type=int, default=DEFAULT_MAX_ZOOM)
    args = parser.parse_args()

    output = Path(args.output)
    print(f"Generando {output} (z{args.min_zoom}-z{args.max_zoom})…")
    count = create_mbtiles(
        output,
        min_zoom=args.min_zoom,
        max_zoom=args.max_zoom,
        bbox=UNARE_BBOX,
    )
    size_mb = output.stat().st_size / (1024 * 1024)
    print(f"Listo: {count} tiles, {size_mb:.1f} MB -> {output}")


if __name__ == "__main__":
    main()
