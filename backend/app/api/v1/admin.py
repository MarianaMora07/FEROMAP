from fastapi import APIRouter, HTTPException, Query, Request, status

from app.api.deps import AdminOnly, DbSession
from app.db.session import SessionLocal
from app.schemas.admin import (
    AdminUser,
    AdminUserCreate,
    AdminUserUpdate,
    AuditLogEntry,
    IntegrationSettings,
    IntegrationSettingsUpdate,
    OperationalSettings,
    OperationalSettingsUpdate,
    SeedResult,
)
from app.services.admin_service import (
    create_user,
    get_integration_settings,
    get_operational_settings,
    list_audit_log,
    list_roles,
    list_users,
    log_audit,
    update_integration_settings,
    update_operational_settings,
    update_user,
)
from app.services.seed_service import run_seed

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


@router.post("/seed", response_model=SeedResult)
def post_admin_seed(request: Request, actor: AdminOnly):
    actor_email = actor.email
    ip_address = request.client.host if request.client else None
    try:
        summary = run_seed()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al cargar seeds: {exc}",
        ) from exc

    with SessionLocal() as session:
        log_audit(
            session,
            actor=None,
            actor_email=actor_email,
            action="seed",
            resource="database",
            details=summary,
            ip_address=ip_address,
        )
        session.commit()

    return {
        "parishes": summary["parishes"],
        "sectors": summary["sectors"],
        "collection_points": summary["collectionPoints"],
        "vehicles": summary["vehicles"],
        "drivers": summary["drivers"],
        "users": summary["users"],
        "optimized_routes": summary["optimizedRoutes"],
        "simulations": summary["simulations"],
        "system_alerts": summary["systemAlerts"],
        "demo_password": summary["demoPassword"],
    }
