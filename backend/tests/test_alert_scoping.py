"""Scoping de alertas por sector/vehículo (F6)."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.alert_service import alert_matches_scope


def _alert(source: str = "", location: str = "") -> SimpleNamespace:
    return SimpleNamespace(source=source, location=location)


def test_vehicle_scope_matches_source_or_location():
    alert = _alert(source="Vehículo TR-06", location="Sector Unare II")

    assert alert_matches_scope(alert, vehicle="TR-06")
    assert alert_matches_scope(alert, vehicle="tr-06")
    assert not alert_matches_scope(alert, vehicle="TR-99")


def test_sector_scope_matches_location():
    alert = _alert(source="Contenedor #121", location="Av. Principal, Unare I")

    assert alert_matches_scope(alert, sector="Unare I")
    assert not alert_matches_scope(alert, sector="Unare II")


def test_combined_scope_requires_both():
    alert = _alert(source="Vehículo TR-06", location="Sector Unare II")

    assert alert_matches_scope(alert, sector="Unare II", vehicle="TR-06")
    assert not alert_matches_scope(alert, sector="Unare I", vehicle="TR-06")


def test_no_scope_matches_everything():
    assert alert_matches_scope(_alert(), sector=None, vehicle=None)
