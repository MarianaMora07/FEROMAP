"""Barrido de pesos del motor multiobjetivo (Fase 13).

Uso: ``podman exec feromap-api python -m scripts.phase13_sweep``
Salida: tabla markdown + ``data/cache/phase13/multiobjective_sweep.json``.
"""

from __future__ import annotations

import sys

from app.db.session import SessionLocal
from app.services.instance_fingerprint import current_fingerprint
from app.services.multiobjective_sweep_service import (
    evaluate_acceptance_criteria,
    load_multiobjective_sweep,
    run_multiobjective_sweep,
)


def _fmt(value: object) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _load_payload() -> dict:
    if "--recompute" in sys.argv[1:]:
        cached = load_multiobjective_sweep()
        if cached is None:
            raise SystemExit("No hay barrido en caché; ejecuta el barrido completo primero.")
        cached["acceptance"] = evaluate_acceptance_criteria(cached["runs"])
        return cached
    with SessionLocal() as db:
        return run_multiobjective_sweep(
            db, instance_fingerprint=current_fingerprint(db, scenario_id="normal")
        )


def main() -> None:
    payload = _load_payload()

    runs = payload["runs"]
    print(f"Fase 13 — barrido multiobjetivo ({payload['durationSeconds']} s, seed={payload['seed']})")
    print(f"Escenario: {payload['scenarioId']} · H_objetivo: {payload['maxRouteHoursTarget']} h")
    print()
    header = (
        "| Caso | Jornada | w_b | w_t | mín. veh. | Dist. km | Veh. activos | "
        "máx. h | holgura h | ≤ objetivo % | σ h | equidad | no cubiertos | s |"
    )
    print(header)
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for run in runs:
        if "error" in run:
            print(f"| {run['label']} | — | — | — | — | ERROR: {run['error']} | | | | | | | | |")
            continue
        print(
            "| {label} | {duration} | {wb} | {wt} | {minreq} | {km} | {active} | {maxh} | "
            "{slack} | {finish} | {std} | {fair} | {unc} | {secs} |".format(
                label=run["label"],
                duration=_fmt(run["durationHours"]),
                wb=_fmt(run["workloadBalanceWeight"]),
                wt=_fmt(run["makespanWeight"]),
                minreq=_fmt(run["minActiveVehiclesRequested"]),
                km=_fmt(run["distanceKmOptimized"]),
                active=run["activeVehicles"],
                maxh=_fmt(run["maxRouteHours"]),
                slack=_fmt(run["shiftSlackHours"]),
                finish=_fmt(run["finishUnderTargetPct"]),
                std=_fmt(run["workloadStdHours"]),
                fair=_fmt(run["fairnessIndex"]),
                unc=run["uncoveredPoints"],
                secs=_fmt(run["computationSeconds"]),
            )
        )

    frontier = payload["paretoFrontier"]
    print()
    print(f"Frontera de Pareto (no dominadas): {len(frontier)} soluciones")
    print("| Caso | Dist. km | Veh. activos | máx. h |")
    print("|---|---|---|---|")
    for run in frontier:
        print(
            f"| {run['label']} | {_fmt(run['distanceKmOptimized'])} | "
            f"{run['activeVehicles']} | {_fmt(run['maxRouteHours'])} |"
        )

    acceptance = payload["acceptance"]
    print()
    accepted = acceptance["ac1"].get("acceptedPoint")
    print(f"AC-1 — punto aceptado: {accepted['label'] if accepted else '—'}")
    if accepted:
        print(
            f"   {'✓' if accepted['ok'] else '✗'} {accepted['distanceKmOptimized']} km "
            f"(línea base {accepted['baselineKm']} km, límite {accepted['limitKm']} km, "
            f"ratio {accepted['ratio']}) → {'OK' if acceptance['ac1']['ok'] else 'FALLA'}"
        )
    for check in acceptance["ac1"]["checks"]:
        print(
            f"   {'✓' if check['ok'] else '✗'} {check['label']}: "
            f"{check['distanceKmOptimized']} km (ratio {check['ratio']})"
        )
    print(f"AC-2 (≥3 vehículos y ≤8 h): {'OK' if acceptance['ac2']['ok'] else 'FALLA'}")
    print(f"   candidatos: {', '.join(acceptance['ac2']['candidates']) or '—'}")
    print(f"AC-3 (≥6 vehículos distintos/semana): {acceptance['ac3']['evidence']}")
    print()
    print("Guardado en data/cache/phase13/multiobjective_sweep.json")


if __name__ == "__main__":
    main()
