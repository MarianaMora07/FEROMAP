"""Tests de ventanas horarias por zona (F8)."""

from __future__ import annotations

from app.domain.zone_window import (
    DAY_WINDOW_SECONDS,
    parse_hhmm,
    window_offsets,
)


def test_parse_hhmm_valid():
    assert parse_hhmm("06:00") == 6 * 3600
    assert parse_hhmm("12:30") == 12 * 3600 + 30 * 60
    assert parse_hhmm("00:00") == 0


def test_parse_hhmm_invalid():
    assert parse_hhmm(None) is None
    assert parse_hhmm("") is None
    assert parse_hhmm("24:00") is None
    assert parse_hhmm("12:60") is None
    assert parse_hhmm("abc") is None


def test_window_offsets_maps_to_shift_start():
    assert window_offsets("06:00", "12:00") == (0, 6 * 3600)
    assert window_offsets("12:00", "18:00") == (6 * 3600, DAY_WINDOW_SECONDS)
    assert window_offsets("07:30", "09:00") == (1 * 3600 + 1800, 3 * 3600)


def test_window_offsets_rejects_invalid():
    assert window_offsets(None, "12:00") is None
    assert window_offsets("12:00", None) is None
    assert window_offsets("12:00", "12:00") is None
    assert window_offsets("12:00", "08:00") is None
    assert window_offsets("05:00", "12:00") is None  # fuera de jornada
    assert window_offsets("12:00", "19:00") is None
