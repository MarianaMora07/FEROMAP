"""Tests para lectura de MBTiles Unare."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.services import mbtiles_service
from app.services.mbtiles_service import (
    mbtiles_metadata,
    read_mbtiles_tile,
)


def _write_sample_mbtiles(path: Path, *, tile_bytes: bytes = b"\x89PNG\r\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
        conn.execute(
            "CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)"
        )
        conn.executemany(
            "INSERT INTO metadata (name, value) VALUES (?, ?)",
            [
                ("name", "test-unare"),
                ("format", "png"),
                ("bounds", "-62.81,8.24,-62.69,8.31"),
                ("minzoom", "12"),
                ("maxzoom", "16"),
                ("attribution", "© test"),
            ],
        )
        conn.execute(
            "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)",
            (13, 2668, (1 << 13) - 1 - 3907, tile_bytes),
        )


def test_mbtiles_metadata_missing_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    missing = tmp_path / "missing.mbtiles"
    monkeypatch.setattr(mbtiles_service.settings, "unare_mbtiles_path", str(missing))

    meta = mbtiles_metadata()

    assert meta.available is False
    assert meta.tile_count == 0
    assert meta.min_zoom == 12
    assert meta.max_zoom == 16


def test_read_mbtiles_tile_roundtrip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    mbtiles_path = tmp_path / "unare.mbtiles"
    payload = b"\x89PNG\r\n\x1a\nfake-tile"
    _write_sample_mbtiles(mbtiles_path, tile_bytes=payload)
    monkeypatch.setattr(mbtiles_service.settings, "unare_mbtiles_path", str(mbtiles_path))

    meta = mbtiles_metadata()
    tile = read_mbtiles_tile(13, 2668, 3907)

    assert meta.available is True
    assert meta.tile_count == 1
    assert tile == payload


def test_read_mbtiles_tile_rejects_out_of_bounds(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mbtiles_path = tmp_path / "unare.mbtiles"
    _write_sample_mbtiles(mbtiles_path)
    monkeypatch.setattr(mbtiles_service.settings, "unare_mbtiles_path", str(mbtiles_path))

    assert read_mbtiles_tile(13, 0, 0) is None
    assert read_mbtiles_tile(10, 2668, 3907) is None
