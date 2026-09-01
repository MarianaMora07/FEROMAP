"""Resolución de puntos de planificación desde casos de estudio (Fase 12.6)."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CaseStudy, CaseStudyPoint, CollectionPoint, WeeklyPlan, WeeklyPlanDay

PointSource = Literal["case_study", "manual"]


def effective_case_study_id(plan: WeeklyPlan, day: WeeklyPlanDay) -> int | None:
    if day.case_study_id is not None:
        return day.case_study_id
    return plan.case_study_id


def resolve_case_study_active_point_ids(db: Session, case_study_id: int) -> list[int]:
    study = db.get(CaseStudy, case_study_id)
    if study is None or study.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Caso de estudio {case_study_id} no encontrado",
        )
    rows = db.scalars(
        select(CaseStudyPoint.collection_point_id)
        .where(
            CaseStudyPoint.case_study_id == case_study_id,
            CaseStudyPoint.active_in_study.is_(True),
        )
        .order_by(CaseStudyPoint.sort_order.nulls_last(), CaseStudyPoint.collection_point_id)
    ).all()
    return sorted(set(rows))


def resolve_weekly_day_point_ids(
    db: Session,
    plan: WeeklyPlan,
    day: WeeklyPlanDay,
) -> tuple[list[int], PointSource, int | None]:
    case_id = effective_case_study_id(plan, day)
    if case_id is not None:
        return resolve_case_study_active_point_ids(db, case_id), "case_study", case_id

    point_ids = set(_json_list(day.collection_point_ids_json))
    sector_ids = _json_list(day.sector_ids_json)
    if sector_ids:
        sector_points = db.scalars(
            select(CollectionPoint.id).where(
                CollectionPoint.sector_id.in_(sector_ids),
                CollectionPoint.deleted_at.is_(None),
                CollectionPoint.status == "active",
            )
        ).all()
        point_ids.update(sector_points)
    return sorted(point_ids), "manual", None


def _json_list(value: str | None) -> list[int]:
    if not value:
        return []
    import json

    try:
        parsed = json.loads(value)
        return [int(item) for item in parsed]
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
