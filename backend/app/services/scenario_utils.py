"""Utilidades compartidas para escenarios de simulación."""


def normalize_scenario_id(scenario_id: str) -> str:
    aliases = {
        "traffic_peak": "peak_traffic",
        "peak-traffic": "peak_traffic",
    }
    return aliases.get(scenario_id, scenario_id)
