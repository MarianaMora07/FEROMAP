"""Genera evidencia B5: reportes por caso + docs/fase-b/evidencia-demo-defensa.md."""

from __future__ import annotations

import sys

from app.db.session import SessionLocal
from app.services.case_study_evidence_service import (
    build_comparative_evidence_markdown,
    build_defense_evidence_markdown,
    defense_evidence_report_path,
    evidence_report_path,
    write_defense_case_reports,
)


def main() -> int:
    defense_path = defense_evidence_report_path()
    phase12_path = evidence_report_path()
    with SessionLocal() as db:
        try:
            report_meta = write_defense_case_reports(db)
            defense_md = build_defense_evidence_markdown(db, report_files=report_meta)
            phase12_md = build_comparative_evidence_markdown(db)
            db.rollback()

            defense_path.parent.mkdir(parents=True, exist_ok=True)
            defense_path.write_text(defense_md, encoding="utf-8")
            phase12_path.parent.mkdir(parents=True, exist_ok=True)
            phase12_path.write_text(phase12_md, encoding="utf-8")

            print(f"✅ Evidencia B5: {defense_path}")
            print(f"✅ Evidencia Fase 12.7: {phase12_path}")
            for key, value in report_meta.items():
                if ":timestamp" not in key:
                    print(f"   · {value}")
            return 0
        except Exception as exc:
            db.rollback()
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
