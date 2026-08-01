import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import settings


@lru_cache
def seeds_dir() -> Path:
    return Path(settings.data_dir) / "seeds"


def load_seed(name: str) -> Any:
    path = seeds_dir() / name
    if not path.exists():
        raise FileNotFoundError(f"Seed no encontrado: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def clear_seed_cache() -> None:
    load_seed.cache_clear()
