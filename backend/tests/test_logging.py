"""Tests del logging estructurado con request-id (F3)."""

from __future__ import annotations

import json
import logging

from app.core.logging import JsonFormatter, RequestIdFilter, set_request_id


def _record(message: str = "hola") -> logging.LogRecord:
    return logging.LogRecord("test", logging.INFO, __file__, 1, message, None, None)


def test_json_formatter_includes_request_id():
    set_request_id("abc123")
    try:
        record = _record()
        RequestIdFilter().filter(record)
        payload = json.loads(JsonFormatter().format(record))
    finally:
        set_request_id(None)

    assert payload["message"] == "hola"
    assert payload["level"] == "INFO"
    assert payload["request_id"] == "abc123"


def test_filter_defaults_to_dash_without_request_id():
    set_request_id(None)
    record = _record("sin-id")
    RequestIdFilter().filter(record)

    assert record.request_id == "-"
    assert json.loads(JsonFormatter().format(record))["request_id"] == "-"
