"""Escenarios operativos del motor: contrato único de ids y etiquetas.

Alineado con ``data/seeds/scenarios.json`` y con ``case_study.VALID_SCENARIO_IDS``.
``SCENARIO_ORDER`` fija el orden canónico con el que se reportan las comparativas por
escenario (Fase 0 / Capítulo V) y el benchmark ACO, para no repetir la lista en cada
consumidor.
"""

from __future__ import annotations

SCENARIO_ORDER: tuple[str, ...] = (
    "normal",
    "peak_traffic",
    "rain",
    "saturated",
    "broken_vehicle",
)

SCENARIO_LABELS: dict[str, str] = {
    "normal": "Tráfico normal",
    "peak_traffic": "Tráfico pico",
    "rain": "Lluvia intensa",
    "saturated": "Contenedores saturados",
    "broken_vehicle": "Vehículo averiado",
}


def scenario_entries() -> list[dict[str, str]]:
    """Pares ``{id, label}`` en el orden canónico, para iterar sin duplicar la lista."""
    return [
        {"id": scenario_id, "label": SCENARIO_LABELS[scenario_id]}
        for scenario_id in SCENARIO_ORDER
    ]
