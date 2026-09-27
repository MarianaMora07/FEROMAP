from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, tzinfo
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password
from app.config import settings
from app.db.models import AuditLog, SystemSettings, User, UserRole
from app.domain.criticality import normalize_critical_threshold
from app.domain.operational_clock import resolve_operational_timezone as domain_timezone
from app.schemas.admin import (
    AdminRole,
    AdminUser,
    AdminUserCreate,
    AdminUserUpdate,
    AlgorithmSettings,
    AlgorithmSettingsUpdate,
    AuditLogEntry,
    IntegrationSettings,
    IntegrationSettingsUpdate,
    OperationalSettings,
    OperationalSettingsUpdate,
)
from app.services.auth_service import get_user_by_email, get_user_by_id, role_label

logger = logging.getLogger(__name__)

DEFAULT_OPERATIONAL: dict[str, Any] = {
    "system_name": "FEROMAP - Sistema Inteligente de Recolección de Residuos",
    "language": "es",
    "timezone": "America/Caracas",
    "date_format": "dd/mm/yyyy",
    "refresh_seconds": 30,
    "max_load_tons": 25.0,
    "idle_minutes": 15,
    "default_speed_kmh": 30.0,
    "max_assign_distance_km": 5.0,
    "auto_recalc_routes": True,
    "distance_unit": "km",
    "volume_unit": "m3",
    "weight_unit": "t",
    "time_unit": "min",
    "fill_threshold_pct": 80,
    "depot_lat": 8.295,
    "depot_lon": -62.715,
    "landfill_lat": 8.280,
    "landfill_lon": -62.690,
    "landfill_unload_minutes": 15,
    "work_start": "06:00",
    "work_end": "18:00",
    "session_timeout_minutes": 60,
}

DEFAULT_INTEGRATIONS: dict[str, Any] = {
    "map_provider": "OpenStreetMap",
    "telemetry_interval_seconds": 30,
    "gis_enabled": True,
    "telemetry_enabled": True,
}

# Parámetros del motor; los valores por defecto provienen del entorno (config.py).
DEFAULT_ALGORITHM: dict[str, Any] = {
    "aco_alpha": 1.0,
    "aco_beta": 3.0,
    "aco_rho": 0.12,
    "pheromone_q": 1.0,
    "pheromone_elitist": False,
    "aco_ants": settings.aco_ants,
    "aco_iterations": settings.aco_iterations,
    "aco_patience": settings.aco_patience,
    "two_opt_passes": 10,
    "heuristic_at_risk_multiplier": 1.50,
    "heuristic_critical_multiplier": 1.35,
    "heuristic_high_multiplier": 1.10,
    "matrix_critical_factor": 0.70,
    "matrix_high_factor": 0.90,
    "overflow_penalty_weight": settings.overflow_penalty_weight,
    "calibration_default_alpha": settings.calibration_default_alpha,
    "calibration_window_days": settings.calibration_window_days,
    "workload_balance_weight": settings.workload_balance_weight,
    "makespan_weight": settings.makespan_weight,
    "min_active_vehicles": settings.min_active_vehicles,
    "max_route_hours_target": settings.max_route_hours_target,
    "default_shift_hours": settings.default_shift_hours,
    "weekly_fleet_rotation": settings.weekly_fleet_rotation,
}

# Cache de proceso del umbral de criticidad (se invalida al actualizar la config).
_critical_threshold_cache: float | None = None

ROLE_DEFINITIONS = [
    AdminRole(
        id="administrador",
        label="Administrador",
        description="Acceso completo al sistema y configuración.",
    ),
    AdminRole(
        id="planificador",
        label="Planificador",
        description="Optimización, simulación, reportes y monitoreo.",
    ),
    AdminRole(
        id="conductor",
        label="Conductor",
        description="Monitoreo de flota y operación en campo.",
    ),
    AdminRole(
        id="residente",
        label="Residente",
        description="Consulta de recolección en su sector.",
    ),
]


def _load_settings_blob(db: Session) -> dict[str, Any]:
    row = db.get(SystemSettings, 1)
    if row is None:
        return {
            "operational": dict(DEFAULT_OPERATIONAL),
            "integrations": dict(DEFAULT_INTEGRATIONS),
            "algorithm": dict(DEFAULT_ALGORITHM),
        }
    return json.loads(row.settings_json)


def _save_settings_blob(db: Session, blob: dict[str, Any]) -> None:
    row = db.get(SystemSettings, 1)
    payload = json.dumps(blob, ensure_ascii=False)
    if row is None:
        db.add(SystemSettings(id=1, settings_json=payload))
    else:
        row.settings_json = payload
    db.flush()


def ensure_default_settings(db: Session) -> None:
    if db.get(SystemSettings, 1) is None:
        _save_settings_blob(
            db,
            {
                "operational": dict(DEFAULT_OPERATIONAL),
                "integrations": dict(DEFAULT_INTEGRATIONS),
                "algorithm": dict(DEFAULT_ALGORITHM),
            },
        )


def log_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    resource: str,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    actor_email: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=actor.id if actor else None,
            actor_email=actor_email if actor_email is not None else (actor.email if actor else None),
            action=action,
            resource=resource,
            resource_id=resource_id,
            details_json=json.dumps(details or {}, ensure_ascii=False),
            ip_address=ip_address,
        )
    )


def list_roles() -> list[AdminRole]:
    return ROLE_DEFINITIONS


def serialize_admin_user(user: User) -> AdminUser:
    return AdminUser(
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


def list_users(db: Session) -> list[AdminUser]:
    users = db.scalars(
        select(User)
        .where(User.deleted_at.is_(None))
        .options(joinedload(User.sector))
        .order_by(User.last_name, User.first_name)
    ).all()
    return [serialize_admin_user(user) for user in users]


def create_user(
    db: Session,
    payload: AdminUserCreate,
    *,
    actor: User,
    ip_address: str | None = None,
) -> AdminUser:
    email = payload.email.lower().strip()
    if get_user_by_email(db, email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El correo ya está registrado")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        role=UserRole(payload.role),
        sector_id=payload.sector_id,
        active=payload.active,
    )
    db.add(user)
    db.flush()
    refreshed = get_user_by_id(db, user.id)
    assert refreshed is not None
    log_audit(
        db,
        actor=actor,
        action="create",
        resource="user",
        resource_id=str(user.id),
        details={"email": email, "role": payload.role},
        ip_address=ip_address,
    )
    return serialize_admin_user(refreshed)


def update_user(
    db: Session,
    user_id: int,
    payload: AdminUserUpdate,
    *,
    actor: User,
    ip_address: str | None = None,
) -> AdminUser:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if payload.first_name is not None:
        user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() or None
    if payload.sector_id is not None:
        user.sector_id = payload.sector_id
    if payload.active is not None:
        if user.id == actor.id and not payload.active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes desactivar tu propia cuenta")
        user.active = payload.active
    if payload.role is not None:
        if user.id == actor.id and payload.role != UserRole.administrador.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes cambiar tu propio rol de administrador",
            )
        user.role = UserRole(payload.role)
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.flush()
    refreshed = get_user_by_id(db, user.id)
    assert refreshed is not None
    log_audit(
        db,
        actor=actor,
        action="update",
        resource="user",
        resource_id=str(user_id),
        details=payload.model_dump(exclude_unset=True, exclude={"password"}),
        ip_address=ip_address,
    )
    return serialize_admin_user(refreshed)


def get_operational_settings(db: Session) -> OperationalSettings:
    ensure_default_settings(db)
    blob = _load_settings_blob(db)
    stored = blob.get("operational", {})
    merged = {**DEFAULT_OPERATIONAL, **stored}
    return OperationalSettings(**merged)


def update_operational_settings(
    db: Session,
    payload: OperationalSettingsUpdate,
    *,
    actor: User,
    ip_address: str | None = None,
) -> OperationalSettings:
    ensure_default_settings(db)
    blob = _load_settings_blob(db)
    operational = blob.setdefault("operational", dict(DEFAULT_OPERATIONAL))
    changes = payload.model_dump(exclude_unset=True)
    operational.update(changes)
    _save_settings_blob(db, blob)
    invalidate_critical_threshold_cache()
    log_audit(
        db,
        actor=actor,
        action="update",
        resource="settings",
        resource_id="operational",
        details=changes,
        ip_address=ip_address,
    )
    return OperationalSettings(**operational)


def resolve_critical_threshold(db: Session) -> float:
    """Umbral de criticidad (%) desde la config operativa, con cache de proceso.

    El dominio (``app.domain.criticality``) no toca la BD: los servicios resuelven
    aquí el umbral y lo inyectan en ``evaluate_criticality`` / ``fill_status_from_level``.
    """
    global _critical_threshold_cache
    if _critical_threshold_cache is None:
        raw = get_operational_settings(db).fill_threshold_pct
        _critical_threshold_cache = normalize_critical_threshold(raw)
    return _critical_threshold_cache


def invalidate_critical_threshold_cache() -> None:
    """Invalida el cache del umbral (tras cambiar la config operativa)."""
    global _critical_threshold_cache
    _critical_threshold_cache = None


def resolve_operational_timezone(db: Session) -> tzinfo:
    """Zona horaria operativa configurada (con respaldo al valor por defecto).

    Las horas de la jornada (ETA por parada, playback) son horas locales de esta zona,
    no UTC. Una configuración ilegible o inválida no debe romper el motor.
    """
    name: str | None = None
    try:
        name = get_operational_settings(db).timezone
    except Exception:  # noqa: BLE001 - fallback seguro ante configuración ilegible
        logger.warning("No se pudo leer la zona horaria operativa; se usa el valor por defecto")
    return domain_timezone(name)


def get_integration_settings(db: Session) -> IntegrationSettings:
    ensure_default_settings(db)
    blob = _load_settings_blob(db)
    return IntegrationSettings(**blob.get("integrations", DEFAULT_INTEGRATIONS))


def get_algorithm_settings(db: Session) -> AlgorithmSettings:
    ensure_default_settings(db)
    blob = _load_settings_blob(db)
    merged = {**DEFAULT_ALGORITHM, **blob.get("algorithm", {})}
    return AlgorithmSettings(**merged)


def update_algorithm_settings(
    db: Session,
    payload: AlgorithmSettingsUpdate,
    *,
    actor: User,
    ip_address: str | None = None,
) -> AlgorithmSettings:
    ensure_default_settings(db)
    blob = _load_settings_blob(db)
    algorithm = blob.setdefault("algorithm", dict(DEFAULT_ALGORITHM))
    changes = payload.model_dump(exclude_unset=True)
    algorithm.update(changes)
    _save_settings_blob(db, blob)
    log_audit(
        db,
        actor=actor,
        action="update",
        resource="settings",
        resource_id="algorithm",
        details=changes,
        ip_address=ip_address,
    )
    return AlgorithmSettings(**algorithm)


def update_integration_settings(
    db: Session,
    payload: IntegrationSettingsUpdate,
    *,
    actor: User,
    ip_address: str | None = None,
) -> IntegrationSettings:
    ensure_default_settings(db)
    blob = _load_settings_blob(db)
    integrations = blob.setdefault("integrations", dict(DEFAULT_INTEGRATIONS))
    changes = payload.model_dump(exclude_unset=True)
    integrations.update(changes)
    _save_settings_blob(db, blob)
    log_audit(
        db,
        actor=actor,
        action="update",
        resource="integrations",
        resource_id="integrations",
        details=changes,
        ip_address=ip_address,
    )
    return IntegrationSettings(**integrations)


def list_audit_log(db: Session, *, limit: int = 50) -> list[AuditLogEntry]:
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    entries: list[AuditLogEntry] = []
    for row in rows:
        details = json.loads(row.details_json) if row.details_json else None
        entries.append(
            AuditLogEntry(
                id=row.id,
                actor_email=row.actor_email,
                action=row.action,
                resource=row.resource,
                resource_id=row.resource_id,
                details=details,
                ip_address=row.ip_address,
                created_at=row.created_at.isoformat() if row.created_at else datetime.now(timezone.utc).isoformat(),
            )
        )
    return entries
