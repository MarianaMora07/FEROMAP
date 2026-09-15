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
    depot_lat: float = 8.295
    depot_lon: float = -62.715
    landfill_lat: float = 8.280
    landfill_lon: float = -62.690
    landfill_unload_minutes: int = 15
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
    depot_lat: float | None = None
    depot_lon: float | None = None
    landfill_lat: float | None = None
    landfill_lon: float | None = None
    landfill_unload_minutes: int | None = Field(default=None, ge=1, le=120)
    work_start: str | None = None
    work_end: str | None = None
    session_timeout_minutes: int | None = Field(default=None, ge=15, le=1440)


class IntegrationSettings(CamelModel):
    map_provider: str = "OpenStreetMap"
    telemetry_interval_seconds: int = 30
    gis_enabled: bool = True
    telemetry_enabled: bool = True


class AlgorithmSettings(CamelModel):
    """Parámetros del motor de optimización (editables por el planificador)."""

    # ACO core
    aco_alpha: float = 1.0
    aco_beta: float = 3.0
    aco_rho: float = 0.12
    pheromone_q: float = 1.0
    pheromone_elitist: bool = False
    aco_ants: int = 8
    aco_iterations: int = 20
    aco_patience: int = 5
    two_opt_passes: int = 10
    # Heurístico de prioridad por llenado
    heuristic_at_risk_multiplier: float = 1.50
    heuristic_critical_multiplier: float = 1.35
    heuristic_high_multiplier: float = 1.10
    matrix_critical_factor: float = 0.70
    matrix_high_factor: float = 0.90
    # Penalización por rebose en la función objetivo (metros por kg rebosado).
    overflow_penalty_weight: float = 0.0
    # Calibración con pesos reales recolectados.
    calibration_default_alpha: float = 0.4
    calibration_window_days: int = 30


class AlgorithmSettingsUpdate(CamelModel):
    aco_alpha: float | None = Field(default=None, gt=0, le=20)
    aco_beta: float | None = Field(default=None, ge=0, le=20)
    aco_rho: float | None = Field(default=None, gt=0, le=1)
    pheromone_q: float | None = Field(default=None, gt=0, le=1_000_000)
    pheromone_elitist: bool | None = None
    aco_ants: int | None = Field(default=None, ge=1, le=200)
    aco_iterations: int | None = Field(default=None, ge=1, le=500)
    aco_patience: int | None = Field(default=None, ge=0, le=100)
    two_opt_passes: int | None = Field(default=None, ge=1, le=100)
    heuristic_at_risk_multiplier: float | None = Field(default=None, gt=0, le=10)
    heuristic_critical_multiplier: float | None = Field(default=None, gt=0, le=10)
    heuristic_high_multiplier: float | None = Field(default=None, gt=0, le=10)
    matrix_critical_factor: float | None = Field(default=None, gt=0, le=1)
    matrix_high_factor: float | None = Field(default=None, gt=0, le=1)
    overflow_penalty_weight: float | None = Field(default=None, ge=0, le=1_000_000)
    calibration_default_alpha: float | None = Field(default=None, gt=0, le=1)
    calibration_window_days: int | None = Field(default=None, ge=1, le=365)


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


class SeedResult(CamelModel):
    parishes: int
    sectors: int
    collection_points: int
    vehicles: int
    drivers: int
    users: int
    optimized_routes: int
    simulations: int
    system_alerts: int
    demo_password: str
