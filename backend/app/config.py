import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://feromap:feromap@db:5432/feromap"
    data_dir: str = "/app/data"


settings = Settings(
    database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://feromap:feromap@db:5432/feromap"),
    data_dir=os.getenv("DATA_DIR", "/app/data"),
)
