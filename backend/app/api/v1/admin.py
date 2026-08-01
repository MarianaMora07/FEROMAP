from fastapi import APIRouter, Query, Request

from app.api.deps import AdminOnly, DbSession
from app.schemas.admin import (
    AdminUser,
    AdminUserCreate,
    AdminUserUpdate,
    AuditLogEntry,
    IntegrationSettings,
    IntegrationSettingsUpdate,
    OperationalSettings,
    OperationalSettingsUpdate,
)
from app.services.admin_service import (
    create_user,
    get_integration_settings,
    get_operational_settings,
    list_audit_log,
    list_roles,
    list_users,
    update_integration_settings,
    update_operational_settings,
    update_user,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/roles")
def get_admin_roles(_user: AdminOnly):
    return list_roles()


@router.get("/users", response_model=list[AdminUser])
def get_admin_users(db: DbSession, _user: AdminOnly):
    return list_users(db)


@router.post("/users", response_model=AdminUser)
def post_admin_user(
    body: AdminUserCreate,
    request: Request,
    db: DbSession,
    actor: AdminOnly,
):
    user = create_user(db, body, actor=actor, ip_address=request.client.host if request.client else None)
    db.commit()
    return user


@router.patch("/users/{user_id}", response_model=AdminUser)
def patch_admin_user(
    user_id: int,
    body: AdminUserUpdate,
    request: Request,
    db: DbSession,
    actor: AdminOnly,
):
    user = update_user(
        db,
        user_id,
        body,
        actor=actor,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return user


@router.get("/settings", response_model=OperationalSettings)
def get_admin_settings(db: DbSession, _user: AdminOnly):
    return get_operational_settings(db)


@router.patch("/settings", response_model=OperationalSettings)
def patch_admin_settings(
    body: OperationalSettingsUpdate,
    request: Request,
    db: DbSession,
    actor: AdminOnly,
):
    settings = update_operational_settings(
        db,
        body,
        actor=actor,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return settings


@router.get("/integrations", response_model=IntegrationSettings)
def get_admin_integrations(db: DbSession, _user: AdminOnly):
    return get_integration_settings(db)


@router.patch("/integrations", response_model=IntegrationSettings)
def patch_admin_integrations(
    body: IntegrationSettingsUpdate,
    request: Request,
    db: DbSession,
    actor: AdminOnly,
):
    settings = update_integration_settings(
        db,
        body,
        actor=actor,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return settings


@router.get("/audit-log", response_model=list[AuditLogEntry])
def get_admin_audit_log(
    db: DbSession,
    _user: AdminOnly,
    limit: int = Query(50, ge=1, le=200),
):
    return list_audit_log(db, limit=limit)
