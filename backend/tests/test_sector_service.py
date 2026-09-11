"""Tests del servicio de sectores (factor de velocidad de llenado)."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.services.sector_service import (
    list_sectors_with_fill_rate,
    update_sector_fill_rate_factor,
)


def test_list_sectors_with_fill_rate_serializes():
    db = MagicMock()
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(id=1, name="Unare I", fill_rate_factor=Decimal("1.5")),
    ]

    assert list_sectors_with_fill_rate(db) == [
        {"id": 1, "name": "Unare I", "fillRateFactor": 1.5}
    ]


def test_update_sector_fill_rate_factor_persists():
    db = MagicMock()
    sector = SimpleNamespace(
        id=3, name="Villa Betania", fill_rate_factor=Decimal("1.0"), deleted_at=None
    )
    db.get.return_value = sector

    result = update_sector_fill_rate_factor(db, 3, 1.75)

    assert result["fillRateFactor"] == 1.75
    assert sector.fill_rate_factor == Decimal("1.75")
    db.commit.assert_called_once()


def test_update_sector_fill_rate_factor_missing_raises():
    db = MagicMock()
    db.get.return_value = None

    with pytest.raises(HTTPException) as exc:
        update_sector_fill_rate_factor(db, 99, 1.5)

    assert exc.value.status_code == 404
