from fastapi import APIRouter

from app.api.deps import DbSession, PlannerOrAdmin
from app.schemas.driver import Driver, DriverCreate, DriverUpdate
from app.services.driver_service import create_driver, list_drivers, update_driver

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
