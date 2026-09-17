"""Contrato compartido de progreso y cancelación de los barridos de calibración.

Los dos barridos del motor (sensibilidad ACO y pesos del objetivo) son intensivos
(~315 s el de sensibilidad) y se ejecutan como job asíncrono. Ambos exponen los
mismos dos hooks opcionales:

- ``on_run(k, total, label)``: se invoca **antes** de la corrida ``k`` (índice
  0-based, ``total`` corridas). No se llama para una corrida ya cancelada.
- ``cancel_check() -> bool``: se consulta **entre corridas**; si devuelve ``True``
  el barrido se detiene lanzando :class:`SweepCancelled` y **no** escribe la caché.

La cancelación no interrumpe la corrida del ACO en curso, solo la frontera entre
corridas (limitación declarada en la UI de calibración).
"""

from __future__ import annotations

from typing import Callable

OnRun = Callable[[int, int, str], None]
"""Callback ``(index, total, label)`` invocado antes de cada corrida."""

CancelCheck = Callable[[], bool]
"""Consulta de cancelación evaluada antes de cada corrida."""

# Identificadores de los barridos (viajan en `params_json` del job y en la API).
SWEEP_SENSITIVITY = "sensitivity"
SWEEP_OBJECTIVE = "objective"
# Validación de la combinación recomendada (2 corridas): no es un barrido OFAT más, sino
# la comprobación de que los mejores niveles medidos rinden juntos.
SWEEP_VALIDATION = "validation"
CALIBRATION_SWEEPS: tuple[str, ...] = (SWEEP_SENSITIVITY, SWEEP_OBJECTIVE, SWEEP_VALIDATION)

# Valores por defecto reproducibles de los barridos (se muestran en la UI).
DEFAULT_SWEEP_SCENARIO = "normal"
DEFAULT_SWEEP_SEED = 42

# Etiqueta humana de cada barrido (fase del job mientras corre).
SWEEP_PHASE_LABELS: dict[str, str] = {
    SWEEP_SENSITIVITY: "Sensibilidad ACO",
    SWEEP_OBJECTIVE: "Barrido de pesos",
    SWEEP_VALIDATION: "Validación de la combinación",
}


class SweepCancelled(Exception):
    """Cancelación solicitada entre corridas de un barrido de calibración."""
