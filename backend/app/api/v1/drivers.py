from fastapi import APIRouter

from app.api.deps import DbSession, PlannerOrAdmin
from app.schemas.driver import Driver, DriverCreate, DriverUpdate
from app.services.driver_service import create_driver, list_drivers, update_driver
from app.services.sector_assignment_service import reassign_sectors, get_sector_driver_summary
from app.services.collection_point_seed_service import generate_missing_collection_points

router = APIRouter(prefix="/drivers", tags=["drivers"])


@router.get("", response_model=list[Driver])
def get_drivers(db: DbSession, _user: PlannerOrAdmin):
    return list_drivers(db)


@router.post("", response_model=Driver)
def post_driver(body: DriverCreate, db: DbSession, _user: PlannerOrAdmin):
    driver = create_driver(db, body)
    db.commit()
    return driver


@router.patch("/{driver_id}", response_model=Driver)
def patch_driver(
    driver_id: int,
    body: DriverUpdate,
    db: DbSession,
    _user: PlannerOrAdmin,
):
    driver = update_driver(db, driver_id, body)
    db.commit()
    return driver


@router.post("/reassign-sectors")
def post_reassign_sectors(db: DbSession, _user: PlannerOrAdmin):
    result = reassign_sectors(db)
    db.commit()
    return result


@router.get("/sector-summary")
def get_sectors_summary(db: DbSession, _user: PlannerOrAdmin):
    return get_sector_driver_summary(db)


@router.post("/seed-collection-points")
def post_seed_collection_points(db: DbSession, _user: PlannerOrAdmin):
    result = generate_missing_collection_points(db)
    db.commit()
    return result
