from typing import Literal

from pydantic import EmailStr, Field
from app.schemas.common import CamelModel


class AdminRole(CamelModel):
    id: str
    label: str
    description: str


class AdminUser(CamelModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str | None = None
    role: str
    role_label: str
    sector_id: int | None = None
    sector_name: str | None = None
    active: bool
    last_login_at: str | None = None
    created_at: str | None = None


class AdminUserCreate(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    phone: str | None = None
    role: Literal["administrador", "planificador", "conductor", "residente"]
    sector_id: int | None = None
    active: bool = True


class AdminUserUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    role: Literal["administrador", "planificador", "conductor", "residente"] | None = None
    sector_id: int | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class OperationalSettings(CamelModel):
    system_name: str = "FEROMAP"
    language: str = "es"
    timezone: str = "America/Caracas"
    date_format: str = "dd/mm/yyyy"
    refresh_seconds: int = 30
    max_load_tons: float = 25.0
    idle_minutes: int = 15
    default_speed_kmh: float = 30.0
    max_assign_distance_km: float = 5.0
    auto_recalc_routes: bool = True
    distance_unit: str = "km"
    volume_unit: str = "m3"
    weight_unit: str = "t"
    time_unit: str = "min"
    fill_threshold_pct: int = 80
    work_start: str = "06:00"
    work_end: str = "18:00"
    session_timeout_minutes: int = 60


class OperationalSettingsUpdate(CamelModel):
    system_name: str | None = None
    language: str | None = None
    timezone: str | None = None
    date_format: str | None = None
    refresh_seconds: int | None = Field(default=None, ge=5, le=3600)
    max_load_tons: float | None = Field(default=None, gt=0)
    idle_minutes: int | None = Field(default=None, ge=1)
    default_speed_kmh: float | None = Field(default=None, gt=0)
    max_assign_distance_km: float | None = Field(default=None, gt=0)
    auto_recalc_routes: bool | None = None
    distance_unit: str | None = None
    volume_unit: str | None = None
    weight_unit: str | None = None
    time_unit: str | None = None
    fill_threshold_pct: int | None = Field(default=None, ge=50, le=100)
    work_start: str | None = None
    work_end: str | None = None
    session_timeout_minutes: int | None = Field(default=None, ge=15, le=1440)


class IntegrationSettings(CamelModel):
    map_provider: str = "OpenStreetMap"
    telemetry_interval_seconds: int = 30
    gis_enabled: bool = True
    telemetry_enabled: bool = True


class IntegrationSettingsUpdate(CamelModel):
    map_provider: str | None = None
    telemetry_interval_seconds: int | None = Field(default=None, ge=5, le=3600)
    gis_enabled: bool | None = None
    telemetry_enabled: bool | None = None


class AuditLogEntry(CamelModel):
    id: int
    actor_email: str | None
    action: str
    resource: str
    resource_id: str | None
    details: dict | None = None
    ip_address: str | None = None
    created_at: str
