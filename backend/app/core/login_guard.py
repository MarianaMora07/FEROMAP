"""Lockout progresivo de intentos de login (estado en memoria por proceso).

Tras `login_max_attempts` fallos para el mismo email, la cuenta se bloquea de
forma temporal y el bloqueo se duplica en cada ronda sucesiva (hasta 15 min).
Un login exitoso reinicia el contador.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.config import settings

_MAX_LOCKOUT_SECONDS = 15 * 60


@dataclass
class _Attempts:
    failures: int = 0
    tier: int = 0
    locked_until: datetime | None = None


_lock = threading.Lock()
_attempts: dict[str, _Attempts] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key(email: str) -> str:
    return (email or "").strip().lower()


def _lock_seconds(tier: int) -> int:
    base = max(1, settings.login_lockout_base_seconds)
    return min(base * (2**tier), _MAX_LOCKOUT_SECONDS)


def check_login_allowed(email: str) -> None:
    """Lanza 429 si la cuenta está bloqueada por intentos fallidos."""
    key = _key(email)
    with _lock:
        entry = _attempts.get(key)
        if entry and entry.locked_until and entry.locked_until > _now():
            remaining = int((entry.locked_until - _now()).total_seconds()) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Demasiados intentos fallidos. Reintenta en {remaining} s.",
                headers={"Retry-After": str(remaining)},
            )


def register_login_failure(email: str) -> None:
    key = _key(email)
    with _lock:
        entry = _attempts.setdefault(key, _Attempts())
        entry.failures += 1
        if entry.failures >= max(1, settings.login_max_attempts):
            entry.locked_until = _now() + timedelta(seconds=_lock_seconds(entry.tier))
            entry.tier += 1
            entry.failures = 0


def register_login_success(email: str) -> None:
    _attempts.pop(_key(email), None)


def reset_login_guard() -> None:
    """Solo para tests."""
    with _lock:
        _attempts.clear()
