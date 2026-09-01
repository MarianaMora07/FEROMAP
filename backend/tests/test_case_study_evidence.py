"""Tests del servicio de evidencia Fase 12.7."""

from __future__ import annotations

from app.services.case_study_evidence_service import _format_table, evidence_report_path


def test_format_table_aligns_columns():
    table = _format_table(
        ["Caso", "km"],
        [["CE-UNARE-NORTE", "42.1"], ["CE-MULTI-VIAJE", "100.0"]],
    )
    assert "CE-UNARE-NORTE" in table
    assert "|" in table
    lines = table.splitlines()
    assert len(lines) >= 3


def test_evidence_report_path_under_docs_fase12():
    path = evidence_report_path()
    assert path.name == "evidencia-casos-estudio.md"
    assert path.parts[-2:] == ("fase-12", "evidencia-casos-estudio.md")
