# ADR-011: La evidencia de calibración vive en la base de datos

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado · **implementado (F13, 2026-09-17)** |
| **Fecha** | 2026-09-17 |
| **Relación** | **Reversa el principio de almacenamiento** de [plan-vista-calibracion.md](./plan-vista-calibracion.md) §4 («la caché JSON en `data/cache/` es la fuente de verdad»). Continúa [ADR-010](./adr-010-motor-multiobjetivo.md). Supersede el sello de instancia como mecanismo de *invalidación*: se conserva como metadato informativo. |

## Contexto

La consola de calibración mostraba dos orígenes distintos para la misma historia:

- los **resultados vigentes** se leían de ficheros (`data/cache/phase3/aco_sensitivity.json`,
  `data/cache/phase13/multiobjective_sweep.json`, `data/cache/phase13/aco_validation.json`);
- el **historial** se leía de la BD (`optimization_jobs`, `job_type='calibration'`).

Esa división produjo tres problemas reales, no teóricos:

1. **`just db-reset` no borraba los números.** La vista seguía mostrando resultados de una instancia
   que ya no existía. Para taparlo se inventó un **sello de instancia** (`instance_fingerprint`) y un
   **banner de frescura** que avisaban «estos resultados son de otra BD».
2. **La evidencia no estaba ni en git ni en la BD.** `data/cache/` está en `.gitignore`: los
   resultados del capítulo de tesis eran un fichero local, perdible con la máquina.
3. **Ruido en el historial.** Una corrida lanzada con «Reutilizar caché» dejaba fila en
   `optimization_jobs` sin haber corrido nada, porque el store de *jobs* hacía de historial.

El sello era, por tanto, un **parche** alrededor de la causa: dos fuentes de verdad.

## Decisión

**La BD es la única fuente de verdad.** Una sola tabla nueva, `calibration_sweeps`, siguiendo el
patrón ya establecido por `statistical_validations` (resumen en columnas tipadas + detalle en un
`payload_json`):

| Columna | Para qué |
|---|---|
| `sweep` · `scenario_id` · `seed` | identificar la corrida (barrido `sensitivity`/`objective`/`validation`) |
| `duration_seconds` · `generated_at` · `created_at` | tiempos del artefacto y del registro |
| `runs_total` · `runs_failed` · `best_distance_km` | **resumen tipado** consultable sin abrir el JSON (el KPI primario es D2) |
| `instance_fingerprint` | **metadato informativo**: con qué instancia se generó |
| `payload_json` | payload íntegro del contrato (§7 del plan de la vista) |

Índice `(sweep, created_at)` porque la consulta que sirve la vista es «la fila más reciente de este
barrido». **No** hay columna `is_current`: *vigente = mayor `created_at`*, igual que en el modelo del
que se copia el patrón.

Decisiones de alcance tomadas junto con esta ADR:

- **Corte directo.** Se retira la caché en fichero; no hay doble escritura. Mantener dos fuentes es
  exactamente lo que causaba la confusión.
- **Sin importación** de los JSON existentes: la evidencia se genera de nuevo.
- **El banner de frescura se retira.** El sello se conserva como columna/API informativa
  (`cacheState` sigue significando `fresh`/`stale`/`unknown`, pero ahora «la instancia cambió desde
  que se generó», no «es de otra BD»).
- **`optimization_jobs` vuelve a ser solo journal de job** (progreso y logs). Deja de listar
  calibraciones, lo que elimina el ruido de las corridas que reutilizaban caché.

## Consecuencias

**Positivas**

- Una sola fuente. Sin sello que interpretar, sin `` ¿de qué BD son estos números? ``.
- La escritura es **atómica**: la corrida se guarda con `commit` solo al terminar, así que «cancelar
  no deja evidencia» se cumple sin código extra (antes era «no escribir el fichero»).
- El resumen tipado permite reportes y analítica (`best_distance_km`, `runs_failed`) sin parsear
  JSON, y el historial deja de depender del payload completo.
- La evidencia se respalda con la BD (`backups/`), no con un fichero suelto ignorado por git.

**Negativas / costos asumidos**

- **`just db-reset` ahora sí borra la evidencia** (antes sobrevivía en fichero). Es el precio
  explícito de tener una sola fuente: para citar resultados en la defensa hay que exportarlos
  (botón *Exportar JSON* de la vista) o quedarse con el fragmento de BD.
- Requiere **migración** (`035_calibration_sweeps`) y cambiar la firma de las lecturas: los `load_*`
  y `create_calibration_job` pasan a recibir `Session` (ya no hay fichero que leer sin BD).
- Los mocks de ~6 archivos de test que sustituían `save_*`/`load_*`/`*_cache_path` se reescriben.
- El **benchmark ACO 5×3** (`GET/POST /benchmarks/aco`) sigue en fichero: es otro artefacto y el plan
  lo declaró «se conserva por compatibilidad».

**Neutrales**

- El contrato HTTP no cambia de forma: el `GET` devuelve el mismo payload más los campos de sello, y
  `runId` viaja como texto aunque por dentro sea entero.
- El frontend no cambia salvo la retirada del banner y el ajuste de copy del sello.

## Alternativas consideradas

- **Reusar `optimization_jobs` como almacén de evidencia.** Rechazada: `params_json` es `Text`
  (filtrar por barrido obliga a parsear en Python, sin índice), mezcla *journal* con *evidencia* y no
  permite KPIs tipados.
- **Doble escritura (fichero + BD) durante una transición.** Rechazada: dos fuentes con riesgo de
  divergir es el problema que se está resolviendo.
- **Mantener el sello como mecanismo de invalidación.** Rechazada: con una sola fuente no hay nada
  que invalidar; el sello sobrevive solo como dato informativo.
- **Importar las cachés existentes a la BD.** Descartada por el propietario: la evidencia se
  regenera con los barridos.
- **Tabla `calibration_evidence` con una fila por (barrido, escenario) y bandera `is_current`.**
  Rechazada: añade un concepto (bandera de vigencia que hay que mantener consistente) donde basta
  `ORDER BY created_at DESC`.

## Verificación

- **Estático:** `alembic upgrade 034_generation_calibration:035_calibration_sweeps --sql` renderiza el
  DDL de la tabla sin tocar la BD; los módulos de modelo, servicios y API importan sin ciclos.
- **Suites (`pytest`, `vitest`): pendientes de ejecución en esta iteración.** La regla del proyecto
  (`.rules`) prohíbe lanzar tests sin pedido explícito, así que no se han corrido; los archivos de
  test afectados se actualizaron al almacén nuevo.
- **Manual, tras aplicar la migración:** `just phase3-sensitivity` → fila en `calibration_sweeps`;
  `GET /benchmarks/aco/sensitivity` sirve esa fila; `just db-reset` deja la vista en «sin datos».

## Referencias

- `backend/app/db/models/calibration_sweep.py` — modelo (patrón de `statistical_validation.py`)
- `backend/alembic/versions/035_calibration_sweeps.py` — migración
- `backend/app/services/calibration_sweep_store.py` — alta, lectura vigente e historial
- `backend/app/services/aco_sensitivity_service.py` · `multiobjective_sweep_service.py` · `aco_validation_service.py` — registran la corrida
- `backend/app/services/instance_fingerprint.py` — sello (ahora informativo)
- [plan-vista-calibracion.md](./plan-vista-calibracion.md) · [ADR-010](./adr-010-motor-multiobjetivo.md)
