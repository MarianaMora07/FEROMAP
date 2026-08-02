from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import CurrentSessionId, CurrentUser, DbSession
from app.schemas.profile import (
    ChangePasswordRequest,
    ProfileDetail,
    ProfilePreferences,
    ProfilePreferencesUpdate,
    ProfileSession,
    ProfileUpdate,
)
from app.services.profile_service import (
    avatar_file_path,
    change_password,
    list_user_sessions,
    profile_detail,
    revoke_user_session,
    save_avatar_upload,
    set_avatar_url,
    update_preferences,
    update_profile,
)

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=ProfileDetail)
def get_profile(db: DbSession, current_user: CurrentUser):
    return profile_detail(db, current_user)


@router.patch("/me", response_model=ProfileDetail)
def patch_profile(body: ProfileUpdate, db: DbSession, current_user: CurrentUser):
    from app.services.auth_service import get_user_by_id

    update_profile(db, current_user, body)
    db.commit()
    refreshed = get_user_by_id(db, current_user.id)
    assert refreshed is not None
    return profile_detail(db, refreshed)


@router.patch("/preferences", response_model=ProfilePreferences)
def patch_preferences(body: ProfilePreferencesUpdate, db: DbSession, current_user: CurrentUser):
    prefs = update_preferences(db, current_user, body)
    db.commit()
    return prefs


@router.post("/change-password")
def post_change_password(body: ChangePasswordRequest, db: DbSession, current_user: CurrentUser):
    result = change_password(db, current_user, body)
    db.commit()
    return result


@router.get("/sessions", response_model=list[ProfileSession])
def get_sessions(db: DbSession, current_user: CurrentUser, session_id: CurrentSessionId):
    return list_user_sessions(db, current_user, current_session_id=session_id)


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    db: DbSession,
    current_user: CurrentUser,
    current_session_id: CurrentSessionId,
):
    revoke_user_session(db, current_user, session_id)
    db.commit()
    return {
        "ok": True,
        "currentSessionRevoked": session_id == current_session_id,
    }


@router.post("/avatar", response_model=ProfileDetail)
async def post_avatar(
    db: DbSession,
    current_user: CurrentUser,
    file: UploadFile | None = File(default=None),
    avatar_url: str | None = Form(default=None),
):
    from app.schemas.profile import AvatarUrlRequest
    from fastapi import HTTPException, status

    if file is not None and file.filename:
        detail = await save_avatar_upload(db, current_user, file)
    elif avatar_url:
        detail = set_avatar_url(db, current_user, AvatarUrlRequest(avatar_url=avatar_url))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Envía un archivo o avatarUrl")
    db.commit()
    return detail


@router.get("/avatar/file")
def get_avatar_file(current_user: CurrentUser):
    path = avatar_file_path(current_user.id)
    if path is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar no encontrado")
    return FileResponse(path)
