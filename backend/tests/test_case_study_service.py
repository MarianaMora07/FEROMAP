"""Tests CRUD del servicio de casos de estudio (Fase 12.2)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, text

from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint
from app.db.session import SessionLocal
from app.schemas.case_study import (
    CaseStudyCreate,
    CaseStudyDuplicate,
    CaseStudyPointInput,
    CaseStudyPointOverride,
    CaseStudyUpdate,
)
from app.services.case_study_service import (
    case_study_points_geojson,
    create_case_study,
    duplicate_case_study,
    get_case_study_detail,
    list_case_studies,
    patch_case_study_point,
    replace_case_study_points,
    update_case_study,
)


def _database_available() -> bool:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not _database_available(), reason="PostgreSQL no disponible"),
]


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session
        session.rollback()


def _two_point_ids(db) -> tuple[int, int]:
    ids = db.scalars(select(CollectionPoint.id).order_by(CollectionPoint.id).limit(2)).all()
    assert len(ids) == 2
    return ids[0], ids[1]


def test_list_case_studies_filters_status(db):
    result = list_case_studies(db, status_filter="active", limit=10, offset=0)
    assert result["total"] >= 3
    assert all(item["status"] == "active" for item in result["items"])


def test_create_case_study_draft(db):
    created = create_case_study(
        db,
        CaseStudyCreate(
            code="CE-TEST-CREATE",
            name="Caso prueba CRUD",
            description="Temporal",
            default_scenario_id="normal",
            default_parameters={"acoAnts": 10},
        ),
    )
    assert created["code"] == "CE-TEST-CREATE"
    assert created["status"] == "draft"
    assert created["defaultParameters"]["acoAnts"] == 10
    assert created["points"] == []


def test_create_rejects_duplicate_code(db):
    create_case_study(
        db,
        CaseStudyCreate(code="CE-TEST-DUP", name="Uno"),
    )
    with pytest.raises(HTTPException) as exc:
        create_case_study(
            db,
            CaseStudyCreate(code="CE-TEST-DUP", name="Dos"),
        )
    assert exc.value.status_code == 409


def test_get_detail_includes_points(db):
    norte = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    assert norte is not None
    detail = get_case_study_detail(db, norte.id)
    assert detail["pointCount"] == 15
    assert len(detail["points"]) == 15
    assert detail["points"][0]["code"].startswith("CNT-")


def test_update_case_study_metadata(db):
    created = create_case_study(
        db,
        CaseStudyCreate(code="CE-TEST-PATCH", name="Antes"),
    )
    updated = update_case_study(
        db,
        created["id"],
        CaseStudyUpdate(name="Después", status="active", default_scenario_id="rain"),
    )
    assert updated["name"] == "Después"
    assert updated["status"] == "active"
    assert updated["defaultScenarioId"] == "rain"


def test_replace_points_and_reject_duplicates(db):
    created = create_case_study(
        db,
        CaseStudyCreate(code="CE-TEST-POINTS", name="Puntos"),
    )
    p1, p2 = _two_point_ids(db)

    replaced = replace_case_study_points(
        db,
        created["id"],
        [
            CaseStudyPointInput(collection_point_id=p1, sort_order=1),
            CaseStudyPointInput(collection_point_id=p2, sort_order=2, demand_kg_override=500),
        ],
    )
    assert replaced["pointCount"] == 2
    assert replaced["points"][1]["demandKgOverride"] == 500

    with pytest.raises(HTTPException) as exc:
        replace_case_study_points(
            db,
            created["id"],
            [
                CaseStudyPointInput(collection_point_id=p1),
                CaseStudyPointInput(collection_point_id=p1),
            ],
        )
    assert exc.value.status_code == 400
    assert "duplicados" in exc.value.detail.lower()


def test_replace_points_rejects_negative_override_schema():
    with pytest.raises(ValidationError):
        CaseStudyPointInput(collection_point_id=1, fill_level_kg_override=-10)


def test_patch_point_override(db):
    norte = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    assert norte is not None
    membership = db.scalar(
        select(CaseStudyPoint)
        .where(
            CaseStudyPoint.case_study_id == norte.id,
            CaseStudyPoint.demand_kg_override.is_(None),
        )
        .order_by(CaseStudyPoint.collection_point_id)
        .limit(1)
    )
    assert membership is not None

    patched = patch_case_study_point(
        db,
        norte.id,
        membership.collection_point_id,
        CaseStudyPointOverride(fill_level_kg_override=900, notes="ajuste tesis"),
    )
    assert patched["fillLevelKgOverride"] == 900
    assert patched["notes"] == "ajuste tesis"
    assert patched["demandSource"] == "fill_override"


def test_duplicate_case_study(db):
    source = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-SUR"))
    assert source is not None
    clone = duplicate_case_study(
        db,
        source.id,
        CaseStudyDuplicate(code="CE-UNARE-SUR-COPY", name="Sur copia"),
    )
    assert clone["code"] == "CE-UNARE-SUR-COPY"
    assert clone["status"] == "draft"
    assert clone["pointCount"] == 15


def test_geojson_returns_active_features(db):
    norte = db.scalar(select(CaseStudy).where(CaseStudy.code == "CE-UNARE-NORTE"))
    assert norte is not None
    geo = case_study_points_geojson(db, norte.id)
    assert geo["type"] == "FeatureCollection"
    assert geo["properties"]["caseStudyCode"] == "CE-UNARE-NORTE"
    assert len(geo["features"]) == 15
    assert geo["features"][0]["geometry"]["type"] == "Point"
