# ADR-009: Baseline OR-Tools y capa de recuperación (regret / ALNS)

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado (post-defensa) |
| **Fecha** | 2026-09-11 |
| **Relación** | F7 · [or-tools-baseline.md](../post-grado/or-tools-baseline.md) · [recuperacion-disrupciones.md](../post-grado/recuperacion-disrupciones.md) · [ADR-003](../fase-0/adr-contingencias.md) · [limites-solver.md](./limites-solver.md) |

## Contexto

La narrativa de defensa está **congelada**: [alineacion-defensa.md](../fase-0/alineacion-defensa.md) excluye
OR-Tools, multi-objetivo y VRPTW, y [post-grado/README.md](../post-grado/README.md) declara el backlog
"congelado (no implementar antes de la defensa)". El motor por defecto minimiza **distancia** (CVRP) y
resuelve contingencias por **re-solve ACO localizado** ([ADR-003](../fase-0/adr-contingencias.md)).

F7 convierte esas limitaciones en **comparación defendible** post-defensa: cuantificar el gap frente a un
baseline exacto y evaluar una capa de recuperación por inserción/ALNS, **sin tocar el camino ACO**.

Hechos relevantes:

- `ortools` **no está instalado** en la imagen; su integración es pesada (peso, versiones) y no debe
  entrar en la ruta crítica de la demo.
- El benchmark existente (`algorithm_benchmark_service`) compara ACO/Clarke-Wright/GA sobre instancias
  controladas, pero no mide **estabilidad del plan** ni incluye un baseline exacto.

## Decisión

Se añade una capa **opcional y comparativa**, nunca por defecto:

1. **Heurísticas reutilizables** en `backend/app/domain/vrp_heuristics.py`:
   - `regret_insertion_cvrp(...)` — inserción por arrepentimiento regret-k, determinista.
   - `alns_cvrp(...)` — ALNS (destrucción aleatoria + reparación regret) con **mejora monótona** sobre
     el plan inicial y determinismo por semilla.
   - `plan_stability_pct(a, b)` — estabilidad como índice de Jaccard de **arcos entre clientes**.
2. **Baseline exacto** en `backend/app/domain/ortools_baseline.py`, con **import perezoso**:
   - `available()` devuelve si la dependencia está presente.
   - `solve_cvrp_ortools(...)` lanza `OrtoolsUnavailableError` si falta, con instrucciones.
3. **Flags** (todos con default que preserva el camino ACO):
   `SOLVER_BACKEND` (`aco`|`ortools`, default `aco`), `CONTINGENCY_STRATEGY`
   (`aco_resolve`|`regret`|`alns`, default `aco_resolve`), `REGRET_K`, `ALNS_ITERATIONS`, `ALNS_SEED`,
   `ORTOOLS_TIME_LIMIT_SECONDS`, `ORTOOLS_MAX_CUSTOMERS`. Valores inválidos **normalizan al default**.
4. **Benchmark ampliado** (`algorithm_benchmark_service`): familias `regret` y `alns` (y `ortools` solo
   si `available()`), más `stabilityPct` por entrada ACO. Se ejecuta con `just benchmark-algorithms`.
5. **`ortools` queda como dependencia opcional** comentada en `requirements.txt`; se habilita a mano.

## Consecuencias

- Evidencia comparativa **reproducible** (distancia, CPU, estabilidad) en
  `data/cache/benchmarks/algorithms_latest.json`.
- **No cambia** el fitness ni el flujo por defecto: el ACO sigue minimizando distancia; los flags nuevos
  no se activan solos.
- **Diferido explícitamente**:
  - El **cableado de regret/ALNS al servicio de contingencias** ([recuperacion-disrupciones.md](../post-grado/recuperacion-disrupciones.md)):
    requiere modelar el estado de las rutas en curso (carga, posición, jornada restante) y es una
    decisión de producto; hoy las heurísticas son una **librería comparativa**, no el camino de producción.
  - **Multi-objetivo** (distancia + tiempo + CO₂) y **VRPTW en OR-Tools**: siguen en backlog.
- `ortools` requiere `pip install ortools` + reconstrucción de la imagen para el baseline exacto; sin él,
  el benchmark lo omite con un aviso.

## Alternativas consideradas

- **Instalar `ortools` como dependencia obligatoria.** Rechazada: peso, superficie de versiones y riesgo;
  contradice el criterio de "no tocar la ruta crítica" del backlog.
- **Cablear ALNS a las contingencias ahora.** Diferida: toca el corazón de la demo y exige modelar el
  estado de rutas en curso; merece su propia fase con flags y comparación (aporte académico de F7).
- **No medir estabilidad.** Rechazada: sin ella, la comparación ACO vs inserción/regret no puede
  argumentar "menos paradas movidas".

## Referencias

- Código: `backend/app/domain/vrp_heuristics.py`, `backend/app/domain/ortools_baseline.py`,
  `backend/app/services/algorithm_benchmark_service.py`, `backend/scripts/benchmark_algorithms.py`
- Flags: `backend/app/config.py`
- Tests: `backend/tests/test_vrp_recovery.py`, `backend/tests/test_vrp_heuristics.py`
- [or-tools-baseline.md](../post-grado/or-tools-baseline.md) — ítem de backlog 1
- [recuperacion-disrupciones.md](../post-grado/recuperacion-disrupciones.md) — ítem de backlog 6
- [ADR-003](../fase-0/adr-contingencias.md) — decisión actual de contingencias
