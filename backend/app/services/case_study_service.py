"""CRUD de casos de estudio (Fase 12.2 — ADR-005)."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint
from app.domain.case_study import (
    CaseStudyPointMembership,
    CatalogPointSnapshot,
    normalize_case_study_code,
    normalize_case_study_status,
    normalize_default_scenario_id,
    resolve_point_demand_kg,
)
from app.schemas.case_study import (
    CaseStudyCreate,
    CaseStudyDuplicate,
    CaseStudyPointInput,
    CaseStudyPointOverride,
    CaseStudyUpdate,
)
from app.services.geo_service import fill_level_pct, priority_from_fill


class CaseStudyNotFoundError(LookupError):
    pass


class CaseStudyPointNotFoundError(LookupError):
    pass


def _parse_default_parameters(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def is_case_study_demo_visible(study: CaseStudy) -> bool:
    params = _parse_default_parameters(study.default_parameters_json)
    return params.get("demoVisible", True) is not False


def _dump_default_parameters(value: dict[str, Any] | None) -> str | None:
    if not value:
        return None
    return json.dumps(value, ensure_ascii=False)


def _default_parameters_from_payload(payload: dict | Any | None) -> dict[str, Any]:
    if payload is None:
        return {}
    if hasattr(payload, "model_dump"):
        return payload.model_dump(by_alias=True, exclude_none=True)
    if isinstance(payload, dict):
        return payload
    return {}


def _get_case_study(db: Session, case_study_id: int) -> CaseStudy:
    study = db.scalar(
        select(CaseStudy)
        .where(CaseStudy.id == case_study_id, CaseStudy.deleted_at.is_(None))
        .options(
            joinedload(CaseStudy.point_memberships)
            .joinedload(CaseStudyPoint.collection_point)
            .joinedload(CollectionPoint.sector)
        )
    )
    if study is None:
        raise CaseStudyNotFoundError(f"Caso de estudio no encontrado: {case_study_id}")
    return study


def _serialize_membership(
    membership: CaseStudyPoint,
    *,
    catalog: CollectionPoint,
) -> dict[str, Any]:
    snapshot = CatalogPointSnapshot(
        collection_point_id=catalog.id,
        max_capacity_kg=float(catalog.max_capacity_kg),
        current_fill_level_kg=float(catalog.current_fill_level_kg),
        status=catalog.status,
    )
    domain_membership = CaseStudyPointMembership(
        collection_point_id=membership.collection_point_id,
        active_in_study=membership.active_in_study,
        fill_level_kg_override=(
            float(membership.fill_level_kg_override)
            if membership.fill_level_kg_override is not None
            else None
        ),
        demand_kg_override=(
            float(membership.demand_kg_override) if membership.demand_kg_override is not None else None
        ),
        notes=membership.notes,
        sort_order=membership.sort_order,
    )
    resolved = resolve_point_demand_kg(snapshot, domain_membership)
    catalog_pct = fill_level_pct(catalog)
    return {
        "collectionPointId": membership.collection_point_id,
        "code": catalog.code,
        "sectorName": catalog.sector.name if catalog.sector else None,
        "activeInStudy": membership.active_in_study,
        "fillLevelKgOverride": (
            float(membership.fill_level_kg_override)
            if membership.fill_level_kg_override is not None
            else None
        ),
        "demandKgOverride": (
            float(membership.demand_kg_override) if membership.demand_kg_override is not None else None
        ),
        "resolvedDemandKg": round(resolved.demand_kg, 2),
        "resolvedFillLevelKg": round(resolved.fill_level_kg, 2),
        "demandSource": resolved.source,
        "catalogFillLevelPct": catalog_pct,
        "notes": membership.notes,
        "sortOrder": membership.sort_order,
    }


def _serialize_case_study(study: CaseStudy, *, include_points: bool = True) -> dict[str, Any]:
    memberships = sorted(
        study.point_memberships,
        key=lambda row: (row.sort_order is None, row.sort_order or 0, row.collection_point_id),
    )
    active_count = sum(1 for row in memberships if row.active_in_study)
    payload: dict[str, Any] = {
        "id": study.id,
        "code": study.code,
        "name": study.name,
        "description": study.description,
        "defaultScenarioId": study.default_scenario_id,
        "defaultParameters": _parse_default_parameters(study.default_parameters_json),
        "status": study.status,
        "activePointCount": active_count,
        "pointCount": len(memberships),
        "createdAt": study.created_at.isoformat() if study.created_at else None,
        "updatedAt": study.updated_at.isoformat() if study.updated_at else None,
    }
    if include_points:
        points: list[dict[str, Any]] = []
        for membership in memberships:
            catalog = membership.collection_point
            if catalog is None:
                continue
            points.append(_serialize_membership(membership, catalog=catalog))
        payload["points"] = points
    return payload


def _validate_unique_point_ids(points: list[CaseStudyPointInput]) -> None:
    seen: set[int] = set()
    duplicates: set[int] = set()
    for row in points:
        if row.collection_point_id in seen:
            duplicates.add(row.collection_point_id)
        seen.add(row.collection_point_id)
    if duplicates:
        ids = ", ".join(str(item) for item in sorted(duplicates))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Puntos duplicados en la misma solicitud: {ids}",
        )


def _ensure_collection_points_exist(db: Session, point_ids: list[int]) -> dict[int, CollectionPoint]:
    if not point_ids:
        return {}
    rows = db.scalars(
        select(CollectionPoint)
        .where(CollectionPoint.id.in_(point_ids), CollectionPoint.deleted_at.is_(None))
        .options(joinedload(CollectionPoint.sector))
    ).all()
    by_id = {row.id: row for row in rows}
    missing = sorted(set(point_ids) - set(by_id))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Puntos de recolección inexistentes: {missing}",
        )
    return by_id


def _validate_override_against_capacity(
    catalog: CollectionPoint,
    *,
    fill_override: float | None,
    demand_override: float | None,
) -> None:
    cap = float(catalog.max_capacity_kg)
    if fill_override is not None and fill_override > cap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"fillLevelKgOverride ({fill_override}) supera capacidad ({cap}) de {catalog.code}",
        )
    if demand_override is not None and demand_override > cap * 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"demandKgOverride ({demand_override}) es implausible para capacidad {cap} de {catalog.code}",
        )


def list_case_studies(
    db: Session,
    *,
    status_filter: str | None = None,
    demo_only: bool = False,
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    stmt = select(CaseStudy).where(CaseStudy.deleted_at.is_(None))
    if status_filter:
        try:
            normalized = normalize_case_study_status(status_filter)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        stmt = stmt.where(CaseStudy.status == normalized)

    studies = db.scalars(
        stmt.options(joinedload(CaseStudy.point_memberships))
        .order_by(CaseStudy.code)
    ).unique().all()

    if demo_only:
        studies = [study for study in studies if is_case_study_demo_visible(study)]

    total = len(studies)
    studies = studies[offset : offset + limit]

    return {
        "items": [_serialize_case_study(study, include_points=False) for study in studies],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def create_case_study(db: Session, payload: CaseStudyCreate) -> dict[str, Any]:
    try:
        code = normalize_case_study_code(payload.code)
        scenario_id = normalize_default_scenario_id(payload.default_scenario_id)
        study_status = normalize_case_study_status(payload.status or "draft")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing = db.scalar(select(CaseStudy).where(CaseStudy.code == code))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un caso de estudio con code={code}",
        )

    study = CaseStudy(
        code=code,
        name=payload.name.strip(),
        description=payload.description,
        default_scenario_id=scenario_id,
        default_parameters_json=_dump_default_parameters(_default_parameters_from_payload(payload.default_parameters)),
        status=study_status,
    )
    db.add(study)
    db.flush()
    db.refresh(study)
    return _serialize_case_study(study, include_points=True)


def get_case_study_detail(db: Session, case_study_id: int) -> dict[str, Any]:
    try:
        study = _get_case_study(db, case_study_id)
    except CaseStudyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _serialize_case_study(study, include_points=True)


def update_case_study(db: Session, case_study_id: int, payload: CaseStudyUpdate) -> dict[str, Any]:
    try:
        study = _get_case_study(db, case_study_id)
    except CaseStudyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if payload.name is not None:
        study.name = payload.name.strip()
    if payload.description is not None:
        study.description = payload.description
    if payload.default_scenario_id is not None:
        try:
            study.default_scenario_id = normalize_default_scenario_id(payload.default_scenario_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if payload.default_parameters is not None:
        study.default_parameters_json = _dump_default_parameters(
            _default_parameters_from_payload(payload.default_parameters)
        )
    if payload.status is not None:
        try:
            study.status = normalize_case_study_status(payload.status)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.flush()
    db.refresh(study)
    return _serialize_case_study(study, include_points=True)


def replace_case_study_points(
    db: Session,
    case_study_id: int,
    points: list[CaseStudyPointInput],
) -> dict[str, Any]:
    try:
        study = _get_case_study(db, case_study_id)
    except CaseStudyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    _validate_unique_point_ids(points)
    catalogs = _ensure_collection_points_exist(db, [row.collection_point_id for row in points])

    for row in points:
        catalog = catalogs[row.collection_point_id]
        _validate_override_against_capacity(
            catalog,
            fill_override=row.fill_level_kg_override,
            demand_override=row.demand_kg_override,
        )

    study.point_memberships.clear()
    db.flush()

    for row in points:
        study.point_memberships.append(
            CaseStudyPoint(
                case_study_id=study.id,
                collection_point_id=row.collection_point_id,
                active_in_study=row.active_in_study,
                fill_level_kg_override=(
                    Decimal(str(row.fill_level_kg_override))
                    if row.fill_level_kg_override is not None
                    else None
                ),
                demand_kg_override=(
                    Decimal(str(row.demand_kg_override)) if row.demand_kg_override is not None else None
                ),
                notes=row.notes,
                sort_order=row.sort_order,
            )
        )

    db.flush()
    db.refresh(study)
    return _serialize_case_study(study, include_points=True)


def patch_case_study_point(
    db: Session,
    case_study_id: int,
    collection_point_id: int,
    payload: CaseStudyPointOverride,
) -> dict[str, Any]:
    try:
        study = _get_case_study(db, case_study_id)
    except CaseStudyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    membership = next(
        (row for row in study.point_memberships if row.collection_point_id == collection_point_id),
        None,
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Punto {collection_point_id} no pertenece al caso {case_study_id}",
        )

    catalog = membership.collection_point or db.get(CollectionPoint, collection_point_id)
    if catalog is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Punto de recolección no encontrado")

    next_fill = (
        payload.fill_level_kg_override
        if payload.fill_level_kg_override is not None
        else (
            float(membership.fill_level_kg_override)
            if membership.fill_level_kg_override is not None
            else None
        )
    )
    next_demand = (
        payload.demand_kg_override
        if payload.demand_kg_override is not None
        else (
            float(membership.demand_kg_override) if membership.demand_kg_override is not None else None
        )
    )
    _validate_override_against_capacity(
        catalog,
        fill_override=next_fill,
        demand_override=next_demand,
    )

    if payload.active_in_study is not None:
        membership.active_in_study = payload.active_in_study
    if payload.fill_level_kg_override is not None:
        membership.fill_level_kg_override = Decimal(str(payload.fill_level_kg_override))
    if payload.demand_kg_override is not None:
        membership.demand_kg_override = Decimal(str(payload.demand_kg_override))
    if payload.notes is not None:
        membership.notes = payload.notes
    if payload.sort_order is not None:
        membership.sort_order = payload.sort_order

    db.flush()
    return _serialize_membership(membership, catalog=catalog)


def duplicate_case_study(
    db: Session,
    case_study_id: int,
    payload: CaseStudyDuplicate | None = None,
) -> dict[str, Any]:
    try:
        source = _get_case_study(db, case_study_id)
    except CaseStudyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    payload = payload or CaseStudyDuplicate()
    base_code = payload.code or f"{source.code}-COPY"
    try:
        code = normalize_case_study_code(base_code)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    suffix = 1
    candidate = code
    while db.scalar(select(CaseStudy.id).where(CaseStudy.code == candidate)) is not None:
        suffix += 1
        candidate = f"{code}-{suffix}"
    code = candidate

    clone = CaseStudy(
        code=code,
        name=(payload.name or f"{source.name} (copia)").strip(),
        description=source.description,
        default_scenario_id=source.default_scenario_id,
        default_parameters_json=source.default_parameters_json,
        status="draft",
    )
    db.add(clone)
    db.flush()

    for membership in source.point_memberships:
        clone.point_memberships.append(
            CaseStudyPoint(
                case_study_id=clone.id,
                collection_point_id=membership.collection_point_id,
                active_in_study=membership.active_in_study,
                fill_level_kg_override=membership.fill_level_kg_override,
                demand_kg_override=membership.demand_kg_override,
                notes=membership.notes,
                sort_order=membership.sort_order,
            )
        )

    db.flush()
    db.refresh(clone)
    return _serialize_case_study(clone, include_points=True)


def case_study_points_geojson(db: Session, case_study_id: int) -> dict[str, Any]:
    try:
        study = _get_case_study(db, case_study_id)
    except CaseStudyNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    features: list[dict[str, Any]] = []
    for membership in sorted(
        study.point_memberships,
        key=lambda row: (row.sort_order is None, row.sort_order or 0, row.collection_point_id),
    ):
        if not membership.active_in_study:
            continue
        catalog = membership.collection_point
        if catalog is None:
            continue
        serialized = _serialize_membership(membership, catalog=catalog)
        pct = int(round(serialized["resolvedFillLevelKg"] / float(catalog.max_capacity_kg) * 100)) if float(
            catalog.max_capacity_kg
        ) > 0 else 0
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "caseStudyId": study.id,
                    "caseStudyCode": study.code,
                    "collectionPointId": catalog.id,
                    "id": catalog.code,
                    "code": catalog.code,
                    "sector": catalog.sector.name if catalog.sector else None,
                    "fillLevel": pct,
                    "catalogFillLevelPct": serialized["catalogFillLevelPct"],
                    "resolvedDemandKg": serialized["resolvedDemandKg"],
                    "demandSource": serialized["demandSource"],
                    "priority": priority_from_fill(pct),
                    "activeInStudy": membership.active_in_study,
                    "sortOrder": membership.sort_order,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(catalog.longitude), float(catalog.latitude)],
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "caseStudyId": study.id,
            "caseStudyCode": study.code,
            "featureCount": len(features),
        },
    }
