from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbSession, PlannerOrAdmin
from app.schemas.collection_point import CollectionPointCreate, CollectionPointUpdate
from app.services.collection_point_service import (
    collection_point_detail,
    collection_point_fill_history,
    collection_points_optimization_context,
    collection_points_summary,
    create_collection_point,
    delete_collection_point,
    export_collection_points_csv,
    list_sector_options,
    update_collection_point,
)

router = APIRouter(tags=["collection-points"])


@router.get("/collection-points/summary")
def get_collection_points_summary(db: DbSession, current_user: CurrentUser):
    return collection_points_summary(db, current_user)


@router.get("/collection-points/sector-options")
def get_collection_point_sector_options(db: DbSession, _user: PlannerOrAdmin):
    return list_sector_options(db)


@router.get("/collection-points/optimization-context")
def get_collection_points_optimization_context(db: DbSession, current_user: CurrentUser):
    return collection_points_optimization_context(db, current_user)


@router.get("/collection-points/export")
def export_collection_points(
    db: DbSession,
    current_user: CurrentUser,
    format: str = Query("csv", pattern="^csv$"),
    sector: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    csv_content = export_collection_points_csv(db, current_user, sector=sector, status=status)
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="feromap-puntos-recoleccion.csv"'},
    )


@router.get("/collection-points/{code}")
def get_collection_point_detail(code: str, db: DbSession, current_user: CurrentUser):
    return collection_point_detail(db, code, current_user)


@router.get("/collection-points/{code}/fill-history")
def get_collection_point_fill_history(
    code: str,
    db: DbSession,
    current_user: CurrentUser,
    days: int = Query(default=7, ge=1, le=30),
):
    return collection_point_fill_history(db, code, current_user, days=days)


@router.post("/collection-points", status_code=status.HTTP_201_CREATED)
def post_collection_point(
    payload: CollectionPointCreate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    return create_collection_point(db, payload)


@router.patch("/collection-points/{code}")
def patch_collection_point(
    code: str,
    payload: CollectionPointUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    return update_collection_point(db, code, payload)


@router.delete("/collection-points/{code}", status_code=status.HTTP_200_OK)
def remove_collection_point(code: str, db: DbSession, _user: PlannerOrAdmin):
    return delete_collection_point(db, code)
