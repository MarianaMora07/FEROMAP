"""Genera benchmark ACO (5 escenarios × 3 perfiles) y guarda en data/cache/benchmarks/."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.services.benchmark_service import run_aco_benchmark


def main() -> None:
    with SessionLocal() as db:
        payload = run_aco_benchmark(db)
    ok = sum(1 for run in payload["runs"] if "error" not in run)
    print(f"✅ Benchmark ACO: {ok}/{len(payload['runs'])} corridas en {payload['durationSeconds']} s")
    print(f"   Guardado en data/cache/benchmarks/aco_latest.json")


if __name__ == "__main__":
    main()
