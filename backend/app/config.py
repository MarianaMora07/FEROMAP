import os

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_aco_for_env() -> tuple[int, int]:
    env = os.getenv("APP_ENV", "local").strip().lower()
    if env == "local":
        return 6, 10
    if env == "staging":
        return 12, 20
    return 12, 20


_DEFAULT_ACO_ANTS, _DEFAULT_ACO_ITERATIONS = _default_aco_for_env()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://feromap:feromap@db:5432/feromap"
    data_dir: str = "/app/data"
    app_env: str = "local"
    jwt_secret: str = "feromap-dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    jwt_cookie_name: str = "feromap_access_token"
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


settings = Settings(
    database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://feromap:feromap@db:5432/feromap"),
    data_dir=os.getenv("DATA_DIR", "/app/data"),
    app_env=os.getenv("APP_ENV", "local"),
    jwt_secret=os.getenv("JWT_SECRET", "feromap-dev-secret-change-in-production"),
    jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
    jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24))),
    jwt_cookie_name=os.getenv("JWT_COOKIE_NAME", "feromap_access_token"),
    aco_ants=int(os.getenv("ACO_ANTS", str(_DEFAULT_ACO_ANTS))),
    aco_iterations=int(os.getenv("ACO_ITERATIONS", str(_DEFAULT_ACO_ITERATIONS))),
    aco_patience=int(os.getenv("ACO_PATIENCE", "5")),
    aco_parallel_workers=int(os.getenv("ACO_PARALLEL_WORKERS", "0")),
    optimization_max_workers=int(os.getenv("OPTIMIZATION_MAX_WORKERS", "2")),
    matrix_incremental_max_additions=int(os.getenv("MATRIX_INCREMENTAL_MAX_ADDITIONS", "3")),
    driver_webhook_url=os.getenv("DRIVER_WEBHOOK_URL") or None,
    unare_mbtiles_path=os.getenv("UNARE_MBTILES_PATH") or None,
)
