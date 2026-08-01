from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.profile import ProfileDetail, ProfileUpdate
from app.services.profile_service import profile_detail, update_profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=ProfileDetail)
def get_profile(current_user: CurrentUser):
    return profile_detail(current_user)


@router.patch("/me", response_model=ProfileDetail)
def patch_profile(body: ProfileUpdate, db: DbSession, current_user: CurrentUser):
    detail = update_profile(db, current_user, body)
    db.commit()
    return detail
