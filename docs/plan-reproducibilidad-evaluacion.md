# Plan — Reproducibilidad de la evaluación (Capítulo V / Fase VI)

> Objetivo: que **todo** lo que reporta la tesis en la TABLA 5.3 y la TABLA 5.4 se
> pueda regenerar con un comando, sin cálculos a mano y sin depender de la caché
> fría/caliente del motor.
>
> Este documento es el plan de ejecución. Cada fase es independiente y verificable.

## 0. Brechas detectadas

| # | Brecha | Evidencia |
|---|---|---|
| B1 | `just phase0-baseline` cubre **3** escenarios (`normal`, `rain`, `saturated`); la TABLA 5.3 lista **5** (añade *hora pico* y *avería*) | `backend/scripts/phase0_baseline_metrics.py` · `PHASE0_SCENARIOS`; `docs/evidencia/instancia-final/phase0-baseline-metrics.json` (`scenarioIds` = 3) |
| B2 | La columna "Cómputo (s)" no es reproducible: mezcla caché fría (hasta 17,6 s) y caliente (5,5–6,1 s) | `docs/evidencia-fase-vi-resultados.md` §3; `distance_matrix_cache.py`; `graph_service.warm_road_graph_cache` |
| B3 | La TABLA 5.4 reporta tamaño de efecto (rangos-biserial 1,00 · d_z 56,29) que la suite **no** calcula | `backend/app/services/statistical_validation.py`; `docs/evidencia-fase-vi-resultados.md` §4 ("no lo reporta la suite") |
| B4 | Solo hay Wilcoxon de `normal`; faltan los otros 4 escenarios | `docs/evidencia-instancia-final.md` §6 |

## 1. Decisiones de diseño (fijadas)

| # | Decisión | Elección |
|---|---|---|
| D1 | Fuente única de los ids de escenario | Promover la lista ordenada de `backend/app/services/benchmark_service.py` (`BENCHMARK_SCENARIOS`) a `backend/app/domain/scenarios.py`; que `phase0` y el benchmark la importen. |
| D2 | ¿`broken_vehicle` standalone o contingencia real? | **Standalone** (según `data/seeds/scenarios.json`: ×1,10 + 5 pp de llenado). |
| D3 | ¿Wilcoxon de los 5 con corrección de familia? | **Sí**: familia pre-declarada de 5 + Holm (`holm_adjust`), reportando p crudo y p Holm. |
| D4 | ¿Cómputo "justo"? | **Caché caliente** declarada; exponer el desglose del motor. |
| D5 | ¿Endpoint o script para el Wilcoxon? | **Ambos**: se conserva/amplía el `POST /validations/statistical` y se añade un **script CLI** con receta `just` (sin auth), sobre el mismo servicio. |

---

## Fase 0 — Preparación

- Congelar snapshot de `docs/evidencia/instancia-final/*.json` para comparar antes/después.
- Confirmar `alembic heads` (hoy `036_stop_confirmation_audit`); la migración nueva será `037_`.
- Fijar la instancia: `just db-reset`; anotar `data/cache/seed_epoch.json` e
  `instance_fingerprint` (`backend/app/services/instance_fingerprint.py`).

## Fase 1 — `just phase0-baseline` con 5 escenarios (+ Críticos)

Implementa **D1** y cierra **B1**.

1. Nuevo `backend/app/domain/scenarios.py`:
   - `SCENARIO_ORDER: tuple[str, ...] = ("normal", "peak_traffic", "rain", "saturated", "broken_vehicle")`
   - `SCENARIO_LABELS: dict[str, str]` (mover los labels desde `benchmark_service.py`).
2. `backend/app/services/benchmark_service.py`: `BENCHMARK_SCENARIOS` se deriva del módulo nuevo (sin duplicar la lista).
3. `backend/scripts/phase0_baseline_metrics.py`: `PHASE0_SCENARIOS = SCENARIO_ORDER`.
   - Añadir la columna **Críticos** desde `kpis["criticalCoveragePct"]`
     (el motor ya lo emite en `optimization_service._compute_kpis`, ~L1919-1922).
4. `justfile` (L164-166): comentario "3 escenarios" → "5 escenarios".

**Aceptación:** `data/cache/phase0-baseline-metrics.json` con `scenarioIds` = 5 y una
fila por escenario con las columnas de la TABLA 5.3 (distancia base/opt, ahorro,
duración, combustible, CO₂, cobertura, críticos, no cubiertos, viajes, cómputo).

## Fase 2 — Cómputo reproducible (D4, cierra B2)

Editado solo `backend/scripts/phase0_baseline_metrics.py`:

- Antes de medir: `warm_road_graph_cache()` (`app/services/graph_service.py`) y, por
  escenario, **una corrida de calentamiento descartada** (`auto_commit=False`, ya hace
  `db.rollback()`) para dejar la matriz de `resolve_distance_matrix`
  (`distance_matrix_cache.py`) en disco.
- En el payload, además de `computationSeconds`, incluir el desglose ya disponible en
  `kpis["engineMetrics"]`: `graphLoadSeconds`, `acoSeconds`, `overheadSeconds`, y
  `cacheState: "warm"`.
- Documentar `acoProfile` y la semilla usada.

**Costo:** el calentamiento duplica las corridas de la tabla (≈ +5 s por escenario).

**Aceptación:** dos ejecuciones seguidas dan el mismo orden de magnitud en "Cómputo (s)"
y el desglose cuadra con el total.

## Fase 3 — Tamaño del efecto en el Wilcoxon (cierra B3)

`backend/app/services/statistical_validation.py` (mismo estilo que `cliffs_delta`):

- `rank_biserial(differences)` → `(Σ rangos⁺ − Σ rangos⁻) / Σ rangos`; `None` si degenera.
  Devuelve `1,00` cuando todas las diferencias tienen el mismo signo.
- `cohen_dz(differences)` → `mean(diff) / std(diff, ddof=1)`; reproduce ≈`56,29` con
  mean ≈ 745 y σ ≈ 13,24.
- Extender `ValidationResult` con `effect_size_r`, `effect_size_dz`, `n_effective` y
  poblarlos en `run_statistical_validation`, `_row_to_dict` y la respuesta del endpoint.

Migración `backend/alembic/versions/037_wilcoxon_effect_size.py` (aditiva, nullable):

- columnas `effect_size_r`, `effect_size_dz`, `n_effective`.
- actualizar `backend/app/db/models/statistical_validation.py`.

**Aceptación:** una corrida `normal` N=30 reporta r=1,00 y d_z≈56,29 **desde el comando**.

## Fase 4 — Wilcoxon en los 5 escenarios (D3 + D5, cierra B4)

Servicio (compartido por endpoint y CLI) en `backend/app/services/statistical_validation.py`:

- `run_statistical_validations(db, *, scenario_ids, n_runs)` que corre cada escenario,
  junta los 5 p-valores y aplica `holm_adjust` (familia pre-declarada). Devuelve por
  escenario: W, p crudo, p Holm, IC, r, d_z, `is_significant` (crudo y Holm).
- Persistir una fila por escenario en `statistical_validations`.

### 4a. Endpoint

`backend/app/api/v1/validations.py`:

- Mantener `POST /validations/statistical?scenarioId=...&nRuns=...` (un escenario).
- Añadir `scenarioIds: list[str] = Query(default=SCENARIO_ORDER)` al mismo endpoint (o
  `POST /validations/statistical/batch` con body `{scenarioIds, nRuns}`) que devuelve
  `{family: [...], holm: [...], validations: [...]}`.
- Añadir los campos de tamaño de efecto a `_row_to_dict`.

```bash
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"plan@fero.com","password":"123456789"}' \
  http://localhost:8000/api/v1/auth/login
curl -s -b cookies.txt -X POST \
  'http://localhost:8000/api/v1/validations/statistical?scenarioId=normal&scenarioId=peak_traffic&scenarioId=rain&scenarioId=saturated&scenarioId=broken_vehicle&nRuns=30'
```

### 4b. Script CLI + receta `just`

- Nuevo `backend/scripts/statistical_validation.py` (patrón de `phase0_baseline_metrics.py`),
  con `SessionLocal` directo (sin auth):
  - `--scenario` (uno o varios) o por defecto los 5; `--n-runs` (default 30).
  - `--workers` (paralelo por semilla, default min(núcleos, 8)) y `--quick` (10 corridas).
  - Escribe `data/cache/statistical-validations.json` + filas en la BD.
- Receta en `justfile`:

```
# Validación Wilcoxon reproducible (5 escenarios, N=30) → data/cache/statistical-validations.json
wilcoxon *args: _check
    {{compose}} exec api python -m scripts.statistical_validation {{args}}
```

**Aceptación:** tanto la llamada al endpoint como `just wilcoxon` devuelven los 5
escenarios con p crudo + p Holm + tamaño de efecto.

## Fase 5 — Artefactos versionados y documentos

- Copiar la salida cruda a `docs/evidencia/instancia-final/validacion-wilcoxon-5-escenarios.json`
  y el nuevo `phase0-baseline-metrics.json`.
- Actualizar `docs/evidencia-instancia-final.md` (§0/§2/§3),
  `docs/evidencia-fase-vi-resultados.md` (§2/§3/§4/§5) y `docs/fase-0/alineacion-defensa.md`.
- `tesis/tesis.md`: TABLA 5.3 (5 filas + Críticos + Cómputo coherente), TABLA 5.4
  (tamaño de efecto ya producido; decidir si se extiende a los 5 escenarios o se mantiene
  `normal`) y resolver FIGURA 5.2 (cobertura vs desborde).
- Cada cifra con `generatedAt` + `instanceFingerprint`.

## Fase 6 — Pruebas (se añaden; no se ejecutan salvo que se pida)

- Unitarias de `rank_biserial` y `cohen_dz`.
- Orquestación multi-escenario con el motor monkeypatcheado (sin ACO real) + verificación
  de Holm sobre la familia.
- Test de que `phase0` emite 5 escenarios y el campo crítico.

---

## Fase 7 — Rendimiento (paralelización y lotes)

Cierre de las tres palancas de velocidad (implementadas):

1. **Sin persistencia** (`persist=False` en `run_optimization_engine`): los consumidores de
   métricas ya no escriben la simulación/rutas/waypoints que luego se revertían. ~44 s → ~7 s
   por corrida.
2. **Lote de nodos del grafo**: `nearest_nodes(graph, lons, lats)` resuelve los 300 puntos en
   una sola pasada (OSMnx reconstruía el KDTree por punto). `graphLoadSeconds` ~3,2 s → ~0,3 s.
3. **Paralelización por semilla**: `run_statistical_validations(..., workers=N)` reparte las
   corridas (escenario × semilla) en un `ProcessPoolExecutor`; cada proceso abre su propia
   sesión (`engine.dispose(close=False)` tras el fork). Resultado idéntico (cada semilla es
   determinista); solo cambia el tiempo de pared.

| Escenario | Antes | Ahora |
|---|---|---|
| Por corrida | ~44 s | ~4–5 s |
| `just phase0-baseline` (10 corridas) | ~7 min | ~1 min |
| `just wilcoxon --scenario normal` (N=30) | ~14 min | ~4,5 min (1 worker) |
| `just wilcoxon` (5 escenarios, N=30) | ~75 min | **~4 min** (`--workers 8`) |

El **endpoint HTTP se conserva** para un escenario/UI y corre secuencial (`workers=1`, sin
`fork` dentro de uvicorn); para lotes, el CLI `just wilcoxon --workers N`.

**Pendiente opcional:** paralelizar también el `phase0-baseline` (hoy secuencial con 1 corrida
de calentamiento por escenario) y cachear en proceso la matriz resuelta.

**Calibración metodológica (Fase 13, C1–C8):** ya hereda `persist=False` (via
`aco_sensitivity_service._run_sensitivity_case`) y el lote de nodos, y ahora también corre en
paralelo por semilla con `--workers` en `just calib-*` (`run_aco_sensitivity(workers=N)`); el job
del API queda secuencial. Medido en C1 · ruido base (8 semillas): 65,1 s → **16,9 s** con 8 workers,
análisis idéntico.

## Resumen de entregables

| Fase | Archivos principales | Entregable |
|---|---|---|
| 1 | `backend/app/domain/scenarios.py` (nuevo), `benchmark_service.py`, `phase0_baseline_metrics.py`, `justfile` | 5 escenarios + Críticos |
| 2 | `phase0_baseline_metrics.py` | Cómputo en caliente con desglose |
| 3 | `statistical_validation.py`, `037_*.py`, modelo, `validations.py` | r y d_z persistidos |
| 4 | `statistical_validation.py`, `validations.py`, `backend/scripts/statistical_validation.py` (nuevo), `justfile` | Endpoint **y** `just wilcoxon` |
| 5 | `docs/**`, `tesis/tesis.md` | Cifras trazables |
| 6 | `backend/tests/**` | Cobertura de lo nuevo (sin ejecutar) |

## Riesgos y notas

- **Los números de la tesis cambiarán** (Cómputo y nuevas filas/escenarios): decidir si
  se ajusta la tesis o el código.
- **`broken_vehicle` standalone** no ejercita la re-optimización reactiva: es el escenario
  de parámetros.
- **Costo de tiempo:** el Wilcoxon real son ≈15 min por escenario → ≈75 min por corrida de
  los 5. El CLI admite `--scenario` para corridas parciales.
- **Migración 037** es aditiva y compatible hacia atrás (columnas `nullable`).
- **Convención de commits:** `type(scope): description` en inglés (ver `.rules`).
