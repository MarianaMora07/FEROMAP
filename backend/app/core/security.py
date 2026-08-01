"""Utilidades de seguridad (hash de contraseñas y JWT)."""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.config import settings

_HASH_PREFIX = "pbkdf2:sha256"
_ITERATIONS = 600_000
_SALT = "fero-demo"


def hash_password(password: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        _SALT.encode(),
        _ITERATIONS,
    )
    return f"{_HASH_PREFIX}${_ITERATIONS}${_SALT}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        prefix, iterations, salt, digest_hex = stored_hash.split("$", 3)
        if prefix != _HASH_PREFIX:
            return False
        expected = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            salt.encode(),
            int(iterations),
        )
        return hmac.compare_digest(expected.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, claims: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire, **(claims or {})}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
