import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_aco_for_env() -> tuple[int, int]:
    env = os.getenv("APP_ENV", "local").strip().lower()
    if env == "local":
        return 6, 10
    if env == "staging":
        return 12, 20
    return 12, 20


_DEFAULT_ACO_ANTS, _DEFAULT_ACO_ITERATIONS = _default_aco_for_env()

# Modelo de criticidad de contenedores (ver docs/fase-0/adr-criticidad.md).
# `state` conserva el comportamiento actual (llenado >= umbral); `risk` incluirá
# además el riesgo de rebose antes de la próxima visita programada.
CRITICALITY_MODELS = ("state", "risk")
DEFAULT_CRITICALITY_MODEL = "state"

# Entornos considerados producción: el arranque exige secretos reales.
PRODUCTION_ENVS = {"production", "prod"}
DEV_JWT_SECRET = "feromap-dev-secret-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://feromap:feromap@db:5432/feromap"
    data_dir: str = "/app/data"
    app_env: str = "local"
    criticality_model: str = DEFAULT_CRITICALITY_MODEL

    # Seguridad y sesiones (Fase 2).
    # `jwt_secret` no tiene default: en producción el arranque falla si falta.
    jwt_secret: str | None = None
    jwt_algorithm: str = "HS256"
    # Access token corto + refresh token rotativo (ver app/api/v1/auth.py).
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_minutes: int = 60 * 24 * 7
    jwt_cookie_name: str = "feromap_access_token"
    jwt_refresh_cookie_name: str = "feromap_refresh_token"
    # None → automático: Secure solo en producción. Se puede forzar con COOKIE_SECURE.
    cookie_secure: bool | None = None
    # Política de contraseñas (altas/cambios; no aplica al verificar el login).
    password_min_length: int = 8
    # Lockout progresivo y rate-limit de login.
    login_max_attempts: int = 5
    login_lockout_base_seconds: int = 30
    login_rate_limit_per_minute: int = 60
    # CORS: obligatorio en producción para permitir orígenes cruzados.
    cors_origins: str | None = None
    # Acciones de demo que mutan datos (p. ej. avance masivo de flota).
    # None → automático: habilitadas en dev, deshabilitadas en producción.
    demo_actions_enabled: bool | None = None

    # Fase 4 — acciones confiables (idempotencia + outbox de notificaciones).
    dispatch_idempotency_enabled: bool = True
    notifications_outbox_enabled: bool = True
    # F5b — confirmación de parada por el conductor (ADR-007). Off por defecto
    # para no alterar el flujo de defensa congelado ni el demo del planificador.
    operator_stop_confirmation_enabled: bool = False
    notification_max_attempts: int = 3
    notification_backoff_base_seconds: int = 30
    # Lista de canales (webhook,smtp,whatsapp); vacío → autodetecta webhook o mock.
    notification_channels: str | None = None
    outbox_worker_enabled: bool = True
    outbox_worker_interval_seconds: int = 15
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True
    whatsapp_webhook_url: str | None = None

    # Fase 7 — baseline exacto y recuperación (post-defensa). Por defecto no cambia
    # el camino ACO: `solver_backend=aco` y `contingency_strategy=aco_resolve`.
    solver_backend: str = "aco"
    contingency_strategy: str = "aco_resolve"
    regret_k: int = 3
    alns_iterations: int = 40
    alns_seed: int = 7
    ortools_time_limit_seconds: float = 5.0
    ortools_max_customers: int = 15

    aco_ants: int = _DEFAULT_ACO_ANTS
    aco_iterations: int = _DEFAULT_ACO_ITERATIONS
    aco_patience: int = 5
    aco_ants_min: int = 4
    aco_ants_max: int = 30
    aco_iterations_min: int = 5
    aco_iterations_max: int = 60
    aco_parallel_workers: int = 0
    optimization_max_workers: int = 2
    matrix_incremental_max_additions: int = 3
    driver_webhook_url: str | None = None
    unare_mbtiles_path: str | None = None

    # Generación de residuos: calibración con pesos reales y penalización por rebose.
    # alpha del EWMA de calibración (más alto = más peso al dato reciente).
    calibration_default_alpha: float = 0.4
    calibration_window_days: int = 30
    # Penalización por rebose en la función objetivo del ACO, en "metros por kg
    # rebosado". 0 desactiva la penalización (comportamiento solo-distancia).
    # Decisión de alcance (Fase 13, D1): el rebose se reporta como KPI
    # (``kpis["overflowKg"]``), no como objetivo, porque su reloj arranca en "ahora" y
    # no en la salida de la flota. Activar este peso requiere antes alinear ese reloj y
    # sumar el rebose a ``objective_active`` (ver docs/fase-3/README-rigor.md).
    overflow_penalty_weight: float = 0.0

    # Fase 13 — optimización multiobjetivo (distancia · uso de flota · tiempo de
    # servicio). Pesos normalizados del objetivo combinado; 0 = solo distancia
    # (comportamiento previo, ver RNF-2).
    workload_balance_weight: float = 0.0
    makespan_weight: float = 0.0
    # Restricción opcional de flota activa por día (None = sin restricción).
    min_active_vehicles: int | None = None
    # Jornada objetivo (h) para el KPI finishUnderTargetPct.
    max_route_hours_target: float = 8.0
    # Jornada de turno por defecto (1–12 h). Recorta el presupuesto de jornada de
    # todas las optimizaciones (día y semana) cuando la corrida no lo especifica;
    # jornadas más cortas reparten la carga entre más vehículos. None = jornada de
    # la instalación (06:00–18:00).
    default_shift_hours: int | None = None
    # Rotación de flota en el horizonte semanal (plan operativo Lun→Vie).
    weekly_fleet_rotation: bool = False

    @property
    def is_production(self) -> bool:
        return (self.app_env or "").strip().lower() in PRODUCTION_ENVS

    @model_validator(mode="after")
    def _apply_security_defaults(self) -> "Settings":
        if not self.jwt_secret:
            if self.is_production:
                raise ValueError(
                    "JWT_SECRET es obligatorio cuando APP_ENV=production. "
                    "Define un secreto fuerte antes de arrancar el API."
                )
            self.jwt_secret = DEV_JWT_SECRET
        if self.cookie_secure is None:
            self.cookie_secure = self.is_production
        if self.demo_actions_enabled is None:
            self.demo_actions_enabled = not self.is_production
        self.solver_backend = (self.solver_backend or "aco").strip().lower()
        if self.solver_backend not in {"aco", "ortools"}:
            self.solver_backend = "aco"
        strategy = (self.contingency_strategy or "aco_resolve").strip().lower()
        if strategy not in {"aco_resolve", "regret", "alns"}:
            strategy = "aco_resolve"
        self.contingency_strategy = strategy
        return self


# Única instancia: los valores provienen de la clase (env + .env), sin defaults duplicados.
settings = Settings()


def resolve_criticality_model(value: str | None = None) -> str:
    """Normaliza ``CRITICALITY_MODEL``; cae a ``state`` si el valor no es válido."""
    candidate = value if value is not None else os.getenv("CRITICALITY_MODEL", settings.criticality_model)
    normalized = (candidate or "").strip().lower()
    return normalized if normalized in CRITICALITY_MODELS else DEFAULT_CRITICALITY_MODEL
