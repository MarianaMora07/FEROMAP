"""Genera evidencia comparativa Fase 12.7 → docs/fase-12/evidencia-casos-estudio.md."""

from __future__ import annotations

import sys

from app.db.session import SessionLocal
from app.services.case_study_evidence_service import (
    build_comparative_evidence_markdown,
    evidence_report_path,
)


def main() -> int:
    path = evidence_report_path()
    with SessionLocal() as db:
        try:
            report = build_comparative_evidence_markdown(db)
            db.rollback()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(report, encoding="utf-8")
            print(f"✅ Evidencia Fase 12.7: {path}")
            return 0
        except Exception as exc:
            db.rollback()
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
