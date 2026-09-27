from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.login_guard import (
    check_login_allowed,
    register_login_failure,
    register_login_success,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.db.models import User, UserRole, UserSession
from app.schemas.auth import UserPublic


ROLE_LABELS = {
    UserRole.administrador: "Administrador",
    UserRole.planificador: "Planificador",
    UserRole.conductor: "Conductor",
    UserRole.residente: "Residente",
}


def user_to_public(user: User) -> UserPublic:
    sector_name = user.sector.name if user.sector else None
    driver_id = user.driver_profile.id if user.driver_profile else None
    return UserPublic(
        id=user.id,
        email=user.email,
        firstName=user.first_name,
        lastName=user.last_name,
        role=user.role.value,
        sectorId=user.sector_id,
        sectorName=sector_name,
        driverId=driver_id,
    )


def role_label(role: UserRole | str) -> str:
    if isinstance(role, str):
        try:
            role = UserRole(role)
        except ValueError:
            return role
    return ROLE_LABELS.get(role, role.value)


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.scalar(
        select(User)
        .where(User.id == user_id, User.deleted_at.is_(None))
        .options(
            joinedload(User.sector),
            joinedload(User.driver_profile),
            joinedload(User.preferences),
        )
    )


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(
        select(User)
        .where(User.email == email.lower().strip(), User.deleted_at.is_(None))
        .options(
            joinedload(User.sector),
            joinedload(User.driver_profile),
            joinedload(User.preferences),
        )
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _store_refresh_token(db: Session, session: UserSession, refresh_token: str) -> None:
    session.refresh_token_hash = hash_token(refresh_token)
    session.refresh_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_refresh_expire_minutes
    )
    db.flush()


def _issue_tokens(db: Session, user: User, session: UserSession) -> tuple[str, str]:
    access = create_access_token(
        subject=str(user.id),
        claims={"role": user.role.value, "email": user.email, "sid": session.id},
    )
    refresh = create_refresh_token(subject=str(user.id), claims={"sid": session.id})
    _store_refresh_token(db, session, refresh)
    return access, refresh


def authenticate_user(
    db: Session,
    email: str,
    password: str,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[str, str, UserPublic, str]:
    """Devuelve (access_token, refresh_token, usuario, session_id).

    Aplica lockout progresivo por email y re-hashea la contraseña si el hash
    almacenado es legado (salt fijo o menos iteraciones).
    """
    check_login_allowed(email)

    user = get_user_by_email(db, email)
    if user is None or not user.active:
        register_login_failure(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    if not verify_password(password, user.password_hash):
        register_login_failure(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    register_login_success(email)

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    user.last_login_at = datetime.now(timezone.utc)
    db.flush()

    from app.services.profile_service import create_user_session

    session = create_user_session(db, user, user_agent=user_agent, ip_address=ip_address)
    access, refresh = _issue_tokens(db, user, session)
    return access, refresh, user_to_public(user), session.id


def rotate_refresh_token(db: Session, refresh_token: str) -> tuple[str, str, UserPublic]:
    """Valida y rota el refresh token. Reutilizar uno viejo revoca la sesión."""
    try:
        payload = decode_refresh_token(refresh_token)
        user_id = int(payload["sub"])
        session_id = str(payload["sid"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o expirado",
        ) from None

    session = db.get(UserSession, session_id)
    now = datetime.now(timezone.utc)
    if session is None or session.user_id != user_id or session.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
        )

    expires_at = _as_utc(session.refresh_expires_at)
    if expires_at is not None and expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión expirada",
        )

    if not session.refresh_token_hash or not hmac.compare_digest(
        session.refresh_token_hash, hash_token(refresh_token)
    ):
        # Reuso de un refresh ya rotado: se revoca la sesión por seguridad.
        session.revoked_at = now
        db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido",
        )

    user = get_user_by_id(db, user_id)
    if user is None or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no disponible",
        )

    session.last_seen_at = now
    access, refresh = _issue_tokens(db, user, session)
    return access, refresh, user_to_public(user)


def revoke_session_by_refresh_token(db: Session, refresh_token: str | None) -> None:
    """Cierra la sesión asociada a un refresh token (logout); silencioso si no aplica."""
    if not refresh_token:
        return
    try:
        payload = decode_refresh_token(refresh_token)
        session_id = str(payload["sid"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return
    session = db.get(UserSession, session_id)
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.flush()
