from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import create_access_token, verify_password
from app.db.models import User, UserRole
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
        )
    )


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(
        select(User)
        .where(User.email == email.lower().strip(), User.deleted_at.is_(None))
        .options(
            joinedload(User.sector),
            joinedload(User.driver_profile),
        )
    )


def authenticate_user(db: Session, email: str, password: str) -> tuple[str, UserPublic]:
    user = get_user_by_email(db, email)
    if user is None or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    user.last_login_at = datetime.now(timezone.utc)
    db.flush()

    token = create_access_token(
        subject=str(user.id),
        claims={"role": user.role.value, "email": user.email},
    )
    return token, user_to_public(user)
