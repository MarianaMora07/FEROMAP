"""Contrato de seeds para integración reproducible."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SEEDS_DIR = REPO_ROOT / "data" / "seeds"

REQUIRED_SEED_FILES = [
    "parish.json",
    "sectors.json",
    "collection_points.json",
    "vehicles.json",
    "drivers.json",
    "routes.json",
    "scenarios.json",
    "kpis.json",
    "alerts.json",
    "monitoring.json",
    "simulations.json",
    "optimization_logs.json",
]

MIN_COUNTS = {
    "sectors.json": None,
    "collection_points.json": None,
    "vehicles.json": None,
    "drivers.json": None,
    "scenarios.json": None,
}


def _load_seed(name: str):
    path = SEEDS_DIR / name
    assert path.exists(), f"Falta {path}. Ejecuta: npm run export-seeds"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("filename", REQUIRED_SEED_FILES)
def test_seed_file_exists(filename: str) -> None:
    path = SEEDS_DIR / filename
    assert path.is_file(), f"Seed requerido no encontrado: {path}"


def test_sectors_seed_contract() -> None:
    data = _load_seed("sectors.json")
    assert isinstance(data, list)
    assert len(data) >= 1
    row = data[0]
    assert "name" in row
    assert row["geometry"]["type"] == "Polygon"
    assert len(row["geometry"]["coordinates"][0]) >= 4


def test_collection_points_seed_contract() -> None:
    data = _load_seed("collection_points.json")
    assert isinstance(data, list)
    assert len(data) >= 1
    row = data[0]
    assert "code" in row
    assert "sectorName" in row
    assert "fillLevelPct" in row
    sector_names = {s["name"] for s in _load_seed("sectors.json")}
    for point in data:
        assert point["sectorName"] in sector_names, point["sectorName"]


def test_vehicles_seed_has_entries() -> None:
    data = _load_seed("vehicles.json")
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "id" in data[0]


def test_drivers_seed_has_entries() -> None:
    data = _load_seed("drivers.json")
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "firstName" in data[0]


def test_scenarios_seed_has_entries() -> None:
    data = _load_seed("scenarios.json")
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "id" in data[0]


def test_kpis_seed_has_normal_scenario() -> None:
    data = _load_seed("kpis.json")
    assert "normal" in data


def test_alembic_versions_present() -> None:
    versions_dir = REPO_ROOT / "backend" / "alembic" / "versions"
    migrations = sorted(versions_dir.glob("*.py"))
    assert len(migrations) >= 8, "Se esperan al menos 8 migraciones Alembic"
