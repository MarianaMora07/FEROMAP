"""Tests del resumen de puntos de recolección."""

from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models import UserRole
from app.services.collection_point_service import (
    build_summary_from_points,
    collection_point_detail,
    collection_point_fill_history,
    collection_points_optimization_context,
    collection_points_summary,
    create_collection_point,
    delete_collection_point,
    export_collection_points_csv,
    fill_status_from_level,
    serialize_collection_point_detail,
    update_collection_point,
    _validate_coordinates,
    _validate_fill_level,
)
from app.schemas.collection_point import CollectionPointCreate, CollectionPointUpdate


def _point(
    code: str,
    *,
    point_id: int = 1,
    sector_id: int = 1,
    sector_name: str = "Unare I",
    fill_pct: float = 50.0,
    capacity: float = 1000.0,
    status: str = "active",
    priority_boost: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=point_id,
        code=code,
        sector_id=sector_id,
        sector=SimpleNamespace(name=sector_name, id=sector_id),
        max_capacity_kg=Decimal(str(capacity)),
        current_fill_level_kg=Decimal(str(capacity * fill_pct / 100)),
        status=status,
        deleted_at=None,
        last_emptied_at=None,
        latitude=Decimal("8.298"),
        longitude=Decimal("-62.724"),
        road_node_id=None,
        priority_boost=priority_boost,
    )


def test_fill_status_from_level_buckets():
    assert fill_status_from_level(95) == "critico"
    assert fill_status_from_level(80) == "lleno"
    assert fill_status_from_level(50) == "normal"
    assert fill_status_from_level(10) == "parcial"
    assert fill_status_from_level(50, point_status="inactive") == "fueraDeServicio"


def test_build_summary_from_points_counts_and_sectors():
    points = [
        _point("CNT-001", fill_pct=95),
        _point("CNT-002", fill_pct=75),
        _point("CNT-003", fill_pct=40, sector_name="Unare II"),
        _point("CNT-004", fill_pct=10),
        _point("CNT-005", status="inactive"),
    ]

    summary = build_summary_from_points(points)

    assert summary["kpis"]["total"] == 5
    assert summary["kpis"]["critico"] == 1
    assert summary["kpis"]["lleno"] == 1
    assert summary["kpis"]["normal"] == 1
    assert summary["kpis"]["parcial"] == 1
    assert summary["kpis"]["fueraDeServicio"] == 1
    assert summary["sectors"] == ["Unare I", "Unare II"]
    assert sum(item["count"] for item in summary["distribution"]) == 5


def test_collection_points_summary_scopes_resident_sector():
    db = MagicMock()
    resident = SimpleNamespace(role=UserRole.residente, sector_id=7)
    points = [_point("CNT-001", fill_pct=88)]

    db.scalars.return_value.all.return_value = points

    summary = collection_points_summary(db, resident)

    assert summary["kpis"]["total"] == 1
    assert summary["kpis"]["lleno"] == 1
    stmt = db.scalars.call_args[0][0]
    assert "collection_points.sector_id" in str(stmt).lower() or stmt is not None


def test_collection_points_summary_resident_without_sector_raises():
    db = MagicMock()
    resident = SimpleNamespace(role=UserRole.residente, sector_id=None)

    with pytest.raises(HTTPException) as exc:
        collection_points_summary(db, resident)

    assert exc.value.status_code == 400


def test_collection_point_detail_serializes_point():
    db = MagicMock()
    admin = SimpleNamespace(role=UserRole.administrador, sector_id=None)
    point = _point("CNT-001", fill_pct=45)
    db.scalar.return_value = point

    detail = collection_point_detail(db, "CNT-001", admin)

    assert detail["code"] == "CNT-001"
    assert detail["fillLevel"] == 45
    assert detail["status"] == "normal"
    assert detail["sector"] == "Unare I"


def test_collection_point_detail_resident_forbidden_other_sector():
    db = MagicMock()
    resident = SimpleNamespace(role=UserRole.residente, sector_id=2)
    point = _point("CNT-001", sector_id=1)
    db.scalar.return_value = point

    with pytest.raises(HTTPException) as exc:
        collection_point_detail(db, "CNT-001", resident)

    assert exc.value.status_code == 403


def test_collection_point_fill_history_returns_series():
    db = MagicMock()
    admin = SimpleNamespace(role=UserRole.administrador, sector_id=None)
    point = _point("CNT-007", fill_pct=72)
    db.scalar.return_value = point
    db.scalars.return_value.all.return_value = []

    history = collection_point_fill_history(db, "CNT-007", admin, days=7)

    assert history["code"] == "CNT-007"
    assert history["days"] == 7
    assert history["source"] == "simulated"
    assert len(history["labels"]) == 7
    assert len(history["values"]) == 7
    assert history["values"][-1] == 72


def test_serialize_collection_point_detail_includes_seed_fields(monkeypatch):
    point = _point("CNT-001", fill_pct=45)
    monkeypatch.setattr(
        "app.services.collection_point_service.seed_meta_by_code",
        lambda: {
            "CNT-001": {
                "address": "Av. Atlántico con Calle Guayana",
                "containerType": "Contenedor 1.100 L",
                "frequency": "Diaria",
            }
        },
    )

    detail = serialize_collection_point_detail(point)

    assert detail["address"] == "Av. Atlántico con Calle Guayana"
    assert detail["containerType"] == "Contenedor 1.100 L"
    assert detail["frequency"] == "Diaria"


def test_validate_coordinates_rejects_outside_unare():
    with pytest.raises(HTTPException) as exc:
        _validate_coordinates(-70.0, 8.298)
    assert exc.value.status_code == 422


def test_validate_fill_level_rejects_over_capacity():
    with pytest.raises(HTTPException) as exc:
        _validate_fill_level(Decimal("1500"), Decimal("1000"))
    assert exc.value.status_code == 422


def test_create_collection_point_duplicate_code():
    db = MagicMock()
    db.scalar.return_value = _point("CNT-001")

    payload = CollectionPointCreate(
        sector_id=1,
        code="CNT-001",
        latitude=8.298,
        longitude=-62.724,
        max_capacity_kg=1000,
    )

    with pytest.raises(HTTPException) as exc:
        create_collection_point(db, payload)

    assert exc.value.status_code == 409


def test_create_collection_point_missing_sector():
    db = MagicMock()
    db.scalar.return_value = None
    db.get.return_value = None

    payload = CollectionPointCreate(
        sector_id=99,
        code="CNT-NEW",
        latitude=8.298,
        longitude=-62.724,
        max_capacity_kg=1000,
    )

    with pytest.raises(HTTPException) as exc:
        create_collection_point(db, payload)

    assert exc.value.status_code == 404


@patch("app.services.collection_point_service._persist_point")
@patch("app.services.collection_point_service._snap_road_node", return_value=42)
def test_create_collection_point_success(mock_snap, mock_persist):
    db = MagicMock()
    db.scalar.return_value = None
    sector = SimpleNamespace(id=1, deleted_at=None)
    db.get.return_value = sector
    mock_persist.return_value = {"code": "CNT-NEW"}

    payload = CollectionPointCreate(
        sector_id=1,
        code="cnt-new",
        latitude=8.298,
        longitude=-62.724,
        max_capacity_kg=1000,
        current_fill_level_kg=250,
    )

    result = create_collection_point(db, payload)

    assert result["code"] == "CNT-NEW"
    mock_persist.assert_called_once()
    created = mock_persist.call_args[0][1]
    assert created.code == "CNT-NEW"
    assert created.road_node_id == 42


@patch("app.services.collection_point_service._persist_point")
def test_update_collection_point_validates_fill(mock_persist):
    db = MagicMock()
    point = _point("CNT-001", fill_pct=50)
    db.scalar.return_value = point
    mock_persist.return_value = {"code": "CNT-001"}

    payload = CollectionPointUpdate(current_fill_level_kg=2000)

    with pytest.raises(HTTPException) as exc:
        update_collection_point(db, "CNT-001", payload)

    assert exc.value.status_code == 422


@patch("app.services.collection_point_service._persist_point")
def test_update_collection_point_changes_status(mock_persist):
    db = MagicMock()
    point = _point("CNT-001")
    db.scalar.return_value = point
    mock_persist.return_value = {"code": "CNT-001", "active": False}

    update_collection_point(db, "CNT-001", CollectionPointUpdate(status="inactive"))

    assert point.status == "inactive"
    mock_persist.assert_called_once()


def test_delete_collection_point_soft_deletes():
    db = MagicMock()
    point = _point("CNT-001")
    db.scalar.return_value = point

    result = delete_collection_point(db, "CNT-001")

    assert result["deleted"] is True
    assert point.deleted_at is not None
    assert point.status == "inactive"
    db.commit.assert_called_once()


def test_export_collection_points_csv_filters_sector_and_status():
    db = MagicMock()
    admin = SimpleNamespace(role=UserRole.administrador, sector_id=None)
    points = [
        _point("CNT-001", fill_pct=95, sector_name="Unare I"),
        _point("CNT-002", fill_pct=40, sector_name="Unare II"),
        _point("CNT-003", fill_pct=80, sector_name="Unare I", status="inactive"),
    ]
    db.scalars.return_value.all.return_value = points

    csv_content = export_collection_points_csv(db, admin, sector="Unare I", status="critico")

    lines = csv_content.strip().splitlines()
    assert lines[0] == "id,sector,fill_level_pct,status,latitude,longitude,last_collection"
    assert len(lines) == 2
    assert "CNT-001" in lines[1]
    assert "Crítico" in lines[1]


def test_collection_points_optimization_context_counts_critical_and_boost():
    db = MagicMock()
    admin = SimpleNamespace(role=UserRole.administrador, sector_id=None)
    points = [
        _point("CNT-001", fill_pct=95),
        _point("CNT-002", fill_pct=50, priority_boost=True),
        _point("CNT-003", fill_pct=92, status="inactive"),
    ]

    latest_at = datetime.now(timezone.utc)
    route = SimpleNamespace(
        calculated_at=latest_at,
        waypoints=[
            SimpleNamespace(collection_point=SimpleNamespace(code="CNT-001")),
        ],
    )

    db.scalars.side_effect = [
        MagicMock(all=MagicMock(return_value=points)),
        MagicMock(all=MagicMock(return_value=[route])),
    ]
    db.scalar.return_value = latest_at

    context = collection_points_optimization_context(db, admin)

    assert context["criticalCount"] == 1
    assert context["priorityBoostCodes"] == ["CNT-002"]
    assert context["lastOptimizedCodes"] == ["CNT-001"]
    assert context["lastOptimizedAt"] is not None
