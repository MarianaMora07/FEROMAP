"""Utilidades de seguridad (hash de contraseñas, política y JWT)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException, status

from app.config import settings

_HASH_PREFIX = "pbkdf2:sha256"
_ITERATIONS = 600_000
# Salt fijo legado (demo). Los hashes con este salt se re-hashean en el login.
_LEGACY_SALT = "fero-demo"

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def hash_password(password: str) -> str:
    """Hash pbkdf2 con **salt aleatorio por usuario** (compatible con verify_password)."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt.encode(),
        _ITERATIONS,
    )
    return f"{_HASH_PREFIX}${_ITERATIONS}${salt}${digest.hex()}"


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


def password_needs_rehash(stored_hash: str) -> bool:
    """True si el hash usa el salt fijo legado o menos iteraciones que las actuales."""
    try:
        prefix, iterations, salt, _digest = stored_hash.split("$", 3)
    except (ValueError, AttributeError):
        return True
    if prefix != _HASH_PREFIX or salt == _LEGACY_SALT:
        return True
    try:
        return int(iterations) < _ITERATIONS
    except (TypeError, ValueError):
        return True


def validate_password_policy(password: str) -> None:
    """Política para altas y cambios de contraseña (no para verificar el login)."""
    min_length = max(1, settings.password_min_length)
    if password is None or len(password) < min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La contraseña debe tener al menos {min_length} caracteres",
        )
    if not password.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña no puede ser solo espacios",
        )


def hash_token(token: str) -> str:
    """Hash determinista para almacenar refresh tokens sin guardar el valor crudo."""
    return hashlib.sha256(token.encode()).hexdigest()


def _encode_token(
    subject: str,
    claims: dict[str, Any] | None,
    *,
    token_type: str,
    expires_minutes: int,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    payload = {"sub": subject, "exp": expire, "typ": token_type, **(claims or {})}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, claims: dict[str, Any] | None = None) -> str:
    return _encode_token(
        subject,
        claims,
        token_type=TOKEN_TYPE_ACCESS,
        expires_minutes=settings.jwt_expire_minutes,
    )


def create_refresh_token(subject: str, claims: dict[str, Any] | None = None) -> str:
    # `jti` aleatorio: cada refresh es único, requisito para detectar reuso tras rotar.
    payload_claims = {**(claims or {}), "jti": secrets.token_hex(16)}
    return _encode_token(
        subject,
        payload_claims,
        token_type=TOKEN_TYPE_REFRESH,
        expires_minutes=settings.jwt_refresh_expire_minutes,
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def decode_access_token(token: str) -> dict[str, Any]:
    payload = decode_token(token)
    # Tokens legados no traen `typ`; se asumen de acceso.
    if payload.get("typ", TOKEN_TYPE_ACCESS) == TOKEN_TYPE_REFRESH:
        raise jwt.InvalidTokenError("Se esperaba un access token")
    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    payload = decode_token(token)
    if payload.get("typ") != TOKEN_TYPE_REFRESH:
        raise jwt.InvalidTokenError("Se esperaba un refresh token")
    return payload
