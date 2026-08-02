from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import hash_password, verify_password
from app.db.models import User, UserPreferences, UserSession
from app.schemas.profile import (
    AvatarUrlRequest,
    ChangePasswordRequest,
    ProfileDetail,
    ProfilePreferences,
    ProfilePreferencesUpdate,
    ProfileSecuritySummary,
    ProfileSession,
    ProfileUpdate,
)
from app.services.auth_service import get_user_by_id, role_label

ALLOWED_THEMES = {"light", "dark", "system"}
ALLOWED_LANGUAGES = {"es", "en", "pt"}
ALLOWED_UNITS = {"metric", "imperial"}
ALLOWED_VIEWS = {"dashboard", "monitoring", "map", "alerts"}
ALLOWED_REPORT_FREQ = {"daily", "weekly", "monthly"}


def _uploads_dir() -> Path:
    path = Path(settings.data_dir) / "uploads" / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_user_preferences(db: Session, user: User) -> UserPreferences:
    if user.preferences is not None:
        return user.preferences
    prefs = UserPreferences(user_id=user.id)
    db.add(prefs)
    db.flush()
    user.preferences = prefs
    return prefs


def preferences_to_schema(prefs: UserPreferences) -> ProfilePreferences:
    return ProfilePreferences(
        theme=prefs.theme,
        language=prefs.language,
        units=prefs.units,
        default_view=prefs.default_view,
        report_frequency=prefs.report_frequency,
        page_size=prefs.page_size,
        email_notifications=prefs.email_notifications,
        system_notifications=prefs.system_notifications,
        address=prefs.address,
        timezone=prefs.timezone,
    )


def _active_session_count(db: Session, user_id: int) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        )
        or 0
    )


def _last_ip(db: Session, user_id: int) -> str | None:
    session = db.scalar(
        select(UserSession)
        .where(UserSession.user_id == user_id)
        .order_by(UserSession.last_seen_at.desc())
        .limit(1)
    )
    return session.ip_address if session else None


def profile_detail(db: Session, user: User) -> ProfileDetail:
    prefs = ensure_user_preferences(db, user)
    return ProfileDetail(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        role=user.role.value,
        role_label=role_label(user.role),
        sector_id=user.sector_id,
        sector_name=user.sector.name if user.sector else None,
        active=user.active,
        avatar_url=user.avatar_url,
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_ip_address=_last_ip(db, user.id),
        preferences=preferences_to_schema(prefs),
        security=ProfileSecuritySummary(
            active_sessions=_active_session_count(db, user.id),
            two_factor_enabled=False,
        ),
    )


def update_profile(db: Session, user: User, payload: ProfileUpdate) -> ProfileDetail:
    if payload.first_name is not None:
        name = payload.first_name.strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nombre inválido")
        user.first_name = name
    if payload.last_name is not None:
        last = payload.last_name.strip()
        if not last:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Apellido inválido")
        user.last_name = last
    if payload.phone is not None:
        user.phone = payload.phone.strip() or None

    db.flush()
    refreshed = get_user_by_id(db, user.id)
    assert refreshed is not None
    return profile_detail(db, refreshed)


def update_preferences(
    db: Session, user: User, payload: ProfilePreferencesUpdate
) -> ProfilePreferences:
    prefs = ensure_user_preferences(db, user)
    data = payload.model_dump(exclude_unset=True)

    if "theme" in data and data["theme"] not in ALLOWED_THEMES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tema inválido")
    if "language" in data and data["language"] not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idioma inválido")
    if "units" in data and data["units"] not in ALLOWED_UNITS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unidades inválidas")
    if "default_view" in data and data["default_view"] not in ALLOWED_VIEWS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vista predeterminada inválida")
    if "report_frequency" in data and data["report_frequency"] not in ALLOWED_REPORT_FREQ:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Frecuencia inválida")

    for key, value in data.items():
        setattr(prefs, key, value)

    db.flush()
    return preferences_to_schema(prefs)


def change_password(db: Session, user: User, payload: ChangePasswordRequest) -> dict[str, bool]:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contraseña actual incorrecta")
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser diferente",
        )
    user.password_hash = hash_password(payload.new_password)
    db.flush()
    return {"ok": True}


def _device_label(user_agent: str | None) -> str:
    if not user_agent:
        return "Dispositivo desconocido"
    ua = user_agent.lower()
    if "mobile" in ua or "android" in ua or "iphone" in ua:
        return "Dispositivo móvil"
    if "windows" in ua:
        return "Windows"
    if "mac" in ua:
        return "macOS"
    if "linux" in ua:
        return "Linux"
    return "Navegador web"


def create_user_session(
    db: Session,
    user: User,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> UserSession:
    session = UserSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        user_agent=user_agent,
        ip_address=ip_address,
        device_label=_device_label(user_agent),
        last_seen_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()
    return session


def validate_session(db: Session, session_id: str | None, user_id: int) -> UserSession | None:
    if not session_id:
        return None
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user_id or session.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida o expirada")
    session.last_seen_at = datetime.now(timezone.utc)
    db.flush()
    return session


def list_user_sessions(db: Session, user: User, *, current_session_id: str | None) -> list[ProfileSession]:
    rows = db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_seen_at.desc())
    ).all()
    return [
        ProfileSession(
            id=row.id,
            device_label=row.device_label or _device_label(row.user_agent),
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            created_at=row.created_at.isoformat() if row.created_at else "",
            last_seen_at=row.last_seen_at.isoformat() if row.last_seen_at else "",
            current=row.id == current_session_id,
        )
        for row in rows
    ]


def revoke_user_session(db: Session, user: User, session_id: str) -> dict[str, bool]:
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.flush()
    return {"ok": True}


def set_avatar_url(db: Session, user: User, payload: AvatarUrlRequest) -> ProfileDetail:
    url = payload.avatar_url.strip()
    if not re.match(r"^https?://", url):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL de avatar inválida")
    user.avatar_url = url
    db.flush()
    refreshed = get_user_by_id(db, user.id)
    assert refreshed is not None
    return profile_detail(db, refreshed)


async def save_avatar_upload(db: Session, user: User, file: UploadFile) -> ProfileDetail:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo debe ser una imagen")

    suffix = ".jpg"
    if file.content_type == "image/png":
        suffix = ".png"
    elif file.content_type == "image/webp":
        suffix = ".webp"

    target = _uploads_dir() / f"{user.id}{suffix}"
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La imagen supera 2 MB")

    target.write_bytes(content)
    user.avatar_url = f"/api/v1/profile/avatar/file"
    db.flush()
    refreshed = get_user_by_id(db, user.id)
    assert refreshed is not None
    return profile_detail(db, refreshed)


def avatar_file_path(user_id: int) -> Path | None:
    for suffix in (".jpg", ".png", ".webp"):
        candidate = _uploads_dir() / f"{user_id}{suffix}"
        if candidate.exists():
            return candidate
    return None


def sync_auth_user(db: Session, user: User) -> dict[str, Any]:
    from app.services.auth_service import user_to_public

    return user_to_public(user).model_dump()
