"""Tests del lockout progresivo de login (Fase 2)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.login_guard import (
    check_login_allowed,
    register_login_failure,
    register_login_success,
    reset_login_guard,
)


@pytest.fixture(autouse=True)
def _clean_guard():
    reset_login_guard()
    yield
    reset_login_guard()


def test_lockout_after_max_failures(monkeypatch):
    monkeypatch.setattr(settings, "login_max_attempts", 3, raising=False)

    check_login_allowed("user@fero.com")
    register_login_failure("user@fero.com")
    register_login_failure("user@fero.com")
    check_login_allowed("user@fero.com")  # aún no llega al umbral

    register_login_failure("user@fero.com")
    with pytest.raises(HTTPException) as exc:
        check_login_allowed("user@fero.com")
    assert exc.value.status_code == 429


def test_success_resets_failure_counter(monkeypatch):
    monkeypatch.setattr(settings, "login_max_attempts", 3, raising=False)

    register_login_failure("otro@fero.com")
    register_login_failure("otro@fero.com")
    register_login_success("otro@fero.com")

    # Tras el éxito, se necesitan 3 fallos nuevos para bloquear.
    register_login_failure("otro@fero.com")
    register_login_failure("otro@fero.com")
    check_login_allowed("otro@fero.com")
