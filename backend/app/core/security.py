"""Utilidades de seguridad (hash de contraseñas para demo y futuro login)."""

from __future__ import annotations

import hashlib
import hmac

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
