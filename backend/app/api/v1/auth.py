from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.deps import CurrentUser, DbSession
from app.config import settings
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth_service import (
    authenticate_user,
    revoke_session_by_refresh_token,
    rotate_refresh_token,
    user_to_public,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_options() -> dict[str, object]:
    # En producción (o con COOKIE_SECURE=true) la cookie exige HTTPS.
    return {"httponly": True, "samesite": "lax", "secure": bool(settings.cookie_secure)}


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.jwt_cookie_name,
        value=access_token,
        max_age=settings.jwt_expire_minutes * 60,
        **_cookie_options(),
    )
    response.set_cookie(
        key=settings.jwt_refresh_cookie_name,
        value=refresh_token,
        max_age=settings.jwt_refresh_expire_minutes * 60,
        **_cookie_options(),
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.jwt_cookie_name)
    response.delete_cookie(settings.jwt_refresh_cookie_name)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, db: DbSession):
    access_token, refresh_token, user, _session_id = authenticate_user(
        db,
        body.email,
        body.password,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(accessToken=access_token, user=user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: DbSession):
    token = request.cookies.get(settings.jwt_refresh_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No hay refresh token",
        )
    access_token, new_refresh_token, user = rotate_refresh_token(db, token)
    db.commit()
    _set_auth_cookies(response, access_token, new_refresh_token)
    return TokenResponse(accessToken=access_token, user=user)


@router.get("/me")
def me(current_user: CurrentUser):
    return user_to_public(current_user)


@router.post("/logout")
def logout(request: Request, response: Response, db: DbSession):
    revoke_session_by_refresh_token(db, request.cookies.get(settings.jwt_refresh_cookie_name))
    db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}
