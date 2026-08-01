from collections.abc import Callable, Generator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import decode_access_token
from app.db.models import User, UserRole
from app.db.session import SessionLocal
from app.services.auth_service import get_user_by_id

_bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def _extract_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    return request.cookies.get(settings.jwt_cookie_name)


def get_current_user(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> User:
    token = _extract_token(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
        session_id = payload.get("sid")
    except (PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = get_user_by_id(db, user_id)
    if user is None or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no disponible",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if session_id:
        from app.services.profile_service import validate_session

        validate_session(db, session_id, user.id)

    return user


def get_current_session_id(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> str | None:
    token = _extract_token(request, credentials)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        sid = payload.get("sid")
        return str(sid) if sid else None
    except (PyJWTError, KeyError, TypeError, ValueError):
        return None


def get_current_user_optional(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> User | None:
    token = _extract_token(request, credentials)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (PyJWTError, KeyError, TypeError, ValueError):
        return None
    user = get_user_by_id(db, user_id)
    if user is None or not user.active:
        return None
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentSessionId = Annotated[str | None, Depends(get_current_session_id)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]


def require_roles(*roles: UserRole) -> Callable[..., User]:
    allowed = set(roles)

    def _checker(current_user: CurrentUser) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para esta acción",
            )
        return current_user

    return _checker


AdminOnly = Annotated[User, Depends(require_roles(UserRole.administrador))]
PlannerOrAdmin = Annotated[User, Depends(require_roles(UserRole.administrador, UserRole.planificador))]
OperationsStaff = Annotated[
    User,
    Depends(
        require_roles(
            UserRole.administrador,
            UserRole.planificador,
            UserRole.conductor,
        )
    ),
]
