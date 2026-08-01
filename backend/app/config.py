import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://feromap:feromap@db:5432/feromap"
    data_dir: str = "/app/data"
    jwt_secret: str = "feromap-dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    jwt_cookie_name: str = "feromap_access_token"


settings = Settings(
    database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://feromap:feromap@db:5432/feromap"),
    data_dir=os.getenv("DATA_DIR", "/app/data"),
    jwt_secret=os.getenv("JWT_SECRET", "feromap-dev-secret-change-in-production"),
    jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
    jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24))),
    jwt_cookie_name=os.getenv("JWT_COOKIE_NAME", "feromap_access_token"),
)
