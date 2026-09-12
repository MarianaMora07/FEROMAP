"""Tests de seguridad de contraseñas y tokens (Fase 2)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import Settings, settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    password_needs_rehash,
    validate_password_policy,
    verify_password,
)


def test_same_password_gets_unique_salt():
    first = hash_password("secret123")
    second = hash_password("secret123")

    assert first != second  # salt aleatorio por usuario
    assert verify_password("secret123", first)
    assert verify_password("secret123", second)
    assert not verify_password("wrong", first)
    assert "fero-demo" not in first


def test_password_needs_rehash_detects_legacy_salt():
    legacy = "pbkdf2:sha256$600000$fero-demo$deadbeef"
    assert password_needs_rehash(legacy) is True
    assert password_needs_rehash(hash_password("longenough")) is False


def test_password_policy_rejects_short_passwords():
    with pytest.raises(HTTPException) as exc:
        validate_password_policy("short")
    assert exc.value.status_code == 400
    validate_password_policy("longenough")


def test_expired_access_token_is_rejected():
    expired = jwt.encode(
        {
            "sub": "1",
            "typ": "access",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(expired)


def test_token_types_are_not_interchangeable():
    access = create_access_token("1", {"sid": "s"})
    refresh = create_refresh_token("1", {"sid": "s"})

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(refresh)
    with pytest.raises(jwt.InvalidTokenError):
        decode_refresh_token(access)


def test_production_requires_jwt_secret(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_dev_falls_back_to_dev_secret(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("APP_ENV", "local")
    local = Settings(_env_file=None)
    assert local.jwt_secret
    assert local.cookie_secure is False


def test_production_cookie_is_secure(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "una-clave-fuerte")
    production = Settings(_env_file=None)
    assert production.cookie_secure is True


def test_demo_actions_disabled_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "una-clave-fuerte")
    monkeypatch.delenv("DEMO_ACTIONS_ENABLED", raising=False)

    assert Settings(_env_file=None).demo_actions_enabled is False


def test_demo_actions_enabled_in_dev(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("DEMO_ACTIONS_ENABLED", raising=False)

    assert Settings(_env_file=None).demo_actions_enabled is True
