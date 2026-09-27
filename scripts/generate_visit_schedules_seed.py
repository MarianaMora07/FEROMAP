#!/usr/bin/env python3
"""Genera data/seeds/visit_schedules.json con frecuencias balanceadas lun–vie (B1)."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.domain.visit_schedule_distribution import (  # noqa: E402
    TARGET_VISIT_SCHEDULE_COUNT,
    default_visit_schedule_rows,
)

OUT_PATH = ROOT / "data" / "seeds" / "visit_schedules.json"


def main() -> None:
    rows = default_visit_schedule_rows(count=TARGET_VISIT_SCHEDULE_COUNT)
    OUT_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    per_day: Counter[int] = Counter()
    for row in rows:
        for weekday in row["weekdays"]:
            if isinstance(weekday, int) and weekday < 5:
                per_day[weekday] += 1

    print(f"Wrote {len(rows)} visit schedules to {OUT_PATH}")
    for offset in range(5):
        label = ["Mon", "Tue", "Wed", "Thu", "Fri"][offset]
        print(f"  {label}: {per_day[offset]} point slots")


if __name__ == "__main__":
    main()
