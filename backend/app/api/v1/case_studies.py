from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, PlannerOrAdmin
from app.schemas.case_study import (
    CaseStudyCreate,
    CaseStudyDuplicate,
    CaseStudyPointOverride,
    CaseStudyPointsReplace,
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

router = APIRouter(prefix="/case-studies", tags=["case-studies"])


@router.get("")
def get_case_studies(
    db: DbSession,
    _user: PlannerOrAdmin,
    status: str | None = Query(default=None),
    demo_only: bool = Query(default=False, alias="demoOnly"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return list_case_studies(db, status_filter=status, demo_only=demo_only, limit=limit, offset=offset)


@router.post("", status_code=status.HTTP_201_CREATED)
def post_case_study(payload: CaseStudyCreate, db: DbSession, _user: PlannerOrAdmin):
    result = create_case_study(db, payload)
    db.commit()
    return result


@router.get("/{case_study_id}")
def get_case_study(case_study_id: int, db: DbSession, _user: PlannerOrAdmin):
    return get_case_study_detail(db, case_study_id)


@router.patch("/{case_study_id}")
def patch_case_study(
    case_study_id: int,
    payload: CaseStudyUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    result = update_case_study(db, case_study_id, payload)
    db.commit()
    return result


@router.put("/{case_study_id}/points")
def put_case_study_points(
    case_study_id: int,
    payload: CaseStudyPointsReplace,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    result = replace_case_study_points(db, case_study_id, payload.points)
    db.commit()
    return result


@router.patch("/{case_study_id}/points/{collection_point_id}")
def patch_case_study_point_override(
    case_study_id: int,
    collection_point_id: int,
    payload: CaseStudyPointOverride,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    result = patch_case_study_point(db, case_study_id, collection_point_id, payload)
    db.commit()
    return result


@router.post("/{case_study_id}/duplicate", status_code=status.HTTP_201_CREATED)
def post_duplicate_case_study(
    case_study_id: int,
    db: DbSession,
    _user: PlannerOrAdmin,
    payload: CaseStudyDuplicate = CaseStudyDuplicate(),
):
    result = duplicate_case_study(db, case_study_id, payload)
    db.commit()
    return result


@router.get("/{case_study_id}/geojson")
def get_case_study_geojson(case_study_id: int, db: DbSession, _user: PlannerOrAdmin):
    return case_study_points_geojson(db, case_study_id)
