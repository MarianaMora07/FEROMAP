from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import User
from app.schemas.profile import ProfileDetail, ProfileUpdate
from app.services.auth_service import get_user_by_id, role_label, user_to_public


def profile_detail(user: User) -> ProfileDetail:
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
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
        created_at=user.created_at.isoformat() if user.created_at else None,
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
    return profile_detail(refreshed)


def sync_auth_user(user: User) -> dict:
    return user_to_public(user).model_dump()
