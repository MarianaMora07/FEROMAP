"""Contrato compartido de progreso y cancelación de los barridos de calibración.

Los dos barridos del motor (sensibilidad ACO y pesos del objetivo) son intensivos
(~315 s el de sensibilidad) y se ejecutan como job asíncrono. Ambos exponen los
mismos dos hooks opcionales:

- ``on_run(k, total, label)``: se invoca **antes** de la corrida ``k`` (índice
  0-based, ``total`` corridas). No se llama para una corrida ya cancelada.
- ``cancel_check() -> bool``: se consulta **entre corridas**; si devuelve ``True``
  el barrido se detiene lanzando :class:`SweepCancelled` y **no** escribe la caché.

El protocolo de calibración metodológica necesita además un **latido después de cada
corrida** (``on_result``): un barrido de 200 corridas que no imprime nada entre la primera y
la última es indistinguible de un proceso colgado.

La cancelación no interrumpe la corrida del ACO en curso, solo la frontera entre
corridas (limitación declarada en la UI de calibración).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

OnRun = Callable[[int, int, str], None]
"""Callback ``(index, total, label)`` invocado antes de cada corrida."""

OnResult = Callable[[dict[str, Any]], None]
"""Callback con el resultado de cada corrida **terminada** (éxito o error)."""

CancelCheck = Callable[[], bool]
"""Consulta de cancelación evaluada antes de cada corrida."""

# Identificadores de los barridos (viajan en `params_json` del job y en la API).
SWEEP_SENSITIVITY = "sensitivity"
SWEEP_OBJECTIVE = "objective"
# Validación de la combinación recomendada (2 corridas): no es un barrido OFAT más, sino
# la comprobación de que los mejores niveles medidos rinden juntos.
SWEEP_VALIDATION = "validation"
# Protocolo de calibración metodológica (C0–C8): comparte el identificador y se distingue por
# el campo `phase` de la raíz del payload. Se lanza por fase, no entero: cada fase es un diseño
# y un coste distintos (de 4 a 200 corridas).
SWEEP_METHOD = "method"
CALIBRATION_SWEEPS: tuple[str, ...] = (
    SWEEP_SENSITIVITY,
    SWEEP_OBJECTIVE,
    SWEEP_VALIDATION,
    SWEEP_METHOD,
)

# Valores por defecto reproducibles de los barridos (se muestran en la UI).
DEFAULT_SWEEP_SCENARIO = "normal"
DEFAULT_SWEEP_SEED = 42

# Etiqueta humana de cada barrido (fase del job mientras corre).
SWEEP_PHASE_LABELS: dict[str, str] = {
    SWEEP_SENSITIVITY: "Sensibilidad ACO",
    SWEEP_OBJECTIVE: "Barrido de pesos",
    SWEEP_VALIDATION: "Validación de la combinación",
    SWEEP_METHOD: "Protocolo metodológico",
}


class SweepCancelled(Exception):
    """Cancelación solicitada entre corridas de un barrido de calibración."""
