from fastapi import APIRouter, Request, Response

from app.api.deps import CurrentUser, DbSession
from app.config import settings
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth_service import authenticate_user, user_to_public

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    token, user, _session_id = authenticate_user(
        db,
        body.email,
        body.password,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    response.set_cookie(
        key=settings.jwt_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
    )
    return TokenResponse(accessToken=token, user=user)


@router.get("/me")
def me(current_user: CurrentUser):
    return user_to_public(current_user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(settings.jwt_cookie_name)
    return {"ok": True}
