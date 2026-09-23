# Evidencia de la instancia final — 300 puntos (Capítulo V)

> Registro de procedencia de las cifras con las que se cierra el documento de tesis.
> Instancia sembrada: **2026-09-22 22:39 UTC** · Commit de referencia: `18d41f4`
> Regenerar: `just db-reset` → `just phase0-baseline` → validación estadística por API (ver §5)

## Objetivo

Dejar constancia de **de dónde salió cada número** del Capítulo V (TABLA 5.3, TABLA 5.4 y FIGURA 5.1), con el comando exacto que lo produce y el resultado que arrojó, de modo que cualquier cifra pueda auditarse o reproducirse antes de la defensa.

---

## 0. Advertencias de persistencia (leer primero)

| Evidencia | Dónde vive | ¿Versionada? | ¿Sobrevive a un reseed? |
|---|---|---|---|
| Comparativa base vs optimizado | `data/cache/phase0-baseline-metrics.json` | ❌ No (`data/cache/` está en `.gitignore`) | ✅ Sí (es un archivo) |
| Validación estadística | Tabla `statistical_validations` en PostgreSQL | ❌ No | ❌ **No** — `just seed` la borra |
| Copia congelada de ambas | `docs/evidencia/instancia-final/` | ✅ Sí | ✅ Sí |

Por eso las dos piezas quedaron **copiadas como snapshot versionado**:

- `docs/evidencia/instancia-final/phase0-baseline-metrics.json`
- `docs/evidencia/instancia-final/validacion-wilcoxon-normal.json`

⚠️ **Si vuelves a correr `just seed` o `just db-reset`, la fila de Wilcoxon desaparece.** Los JSON del snapshot permanecen, pero la validación estadística habría que regenerarla (≈15 min por escenario).

---

## 1. Reconstrucción de la instancia (dato base)

```bash
just db-reset      # down-volumes → up → wait-db → migrate (001→035) → seed
```

Estado resultante (verificado con consultas a PostgreSQL):

| Entidad | Cantidad |
|---|---|
| Parroquias | 1 |
| Sectores | 91 (91 con `per_capita_kg_per_day`), población total **121.200 hab** |
| Puntos de recolección | **300** (todos con tasa de generación), **79.276 kg/día** |
| Flota | 24 = 7 Compactadora (6.000–7.000 kg) + 17 Volteo (1.200–3.000 kg), 0,35 L/km |
| Conductores / usuarios | 24 / 27 |
| Casos de estudio | 4 (`CE-COMBINATORIO`, `CE-MULTI-VIAJE`, `CE-UNARE-NORTE`, `CE-UNARE-SUR`) con 342 puntos |
| Horarios de visita | 300 |
| Grafo vial en caché | 2.363 nodos / 5.467 aristas |
| Rutas optimizadas / simulaciones | 0 / 0 (el seed limpia y no genera corridas) |

**Prerrequisito no versionado:** el reparto GPC (población × per cápita → tasa por punto) depende de que los 39 sectores nuevos de `data/seeds/sectors.json` tengan `perCapitaKgPerDay`. Ese campo se agregó en el árbol de trabajo (0,65 por defecto, 0,78 en `Unare I`) y **aún no está commiteado**. Si se reseeda desde un checkout limpio, los 39 sectores quedan sin tasa y los 79.276 kg/día cambian.

---

## 2. Evidencia A — Comparativa línea base vs optimizado

Alimenta **TABLA 5.3** y **FIGURA 5.1**.

```bash
just phase0-baseline
# equivale a: ./scripts/compose.sh exec api python -m scripts.phase0_baseline_metrics
```

- Salida: `data/cache/phase0-baseline-metrics.json` (generado **2026-09-22 22:42:12 UTC**)
- Perfil ACO de la corrida: `ants = 12`, `iterations = 20`
- Escenarios: `normal`, `rain`, `saturated`
- Nota: el script **no escribe en la base de datos** (hace `db.rollback()`); solo produce el JSON.

| Escenario | Distancia base (km) | Distancia opt. (km) | Ahorro | Duración base (h) | Duración opt. (h) | Combustible base (L) | Combustible opt. (L) | CO₂ evitado (kg) | Cobertura | No cubiertos | Viajes vertedero | Cómputo (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `normal` | 1808,7 | 1076,0 | **+40,5 %** | 156,85 | 144,59 | 633,0 | 376,6 | 687,2 | 100 % → 100 % | 0 | 43 | 10,3 |
| `rain` | 1795,0 | 1121,1 | **+37,5 %** | 158,78 | 147,10 | 628,2 | 392,4 | 632,1 | 100 % → 100 % | 0 | 46 | 10,7 |
| `saturated` | 1973,4 | 1250,6 | **+36,6 %** | 165,93 | 152,27 | 690,7 | 437,7 | 678,0 | 100 % → 100 % | 0 | 50 | 10,9 |

**Respalda:** el «hasta un 40 %» del resumen (máximo observado 40,5 %) y el «por debajo de los 60 segundos» de Fase V (máximo 10,9 s).

**Ojo al redactar:** `durationHours` es **tiempo acumulado de toda la flota** (24 vehículos ≈ 6 h por vehículo), no la duración de una ruta individual.

---

## 3. Evidencia B — Validación estadística (Wilcoxon)

Alimenta **TABLA 5.4**. Se dispara por API con sesión de planificador (no hay receta `just`).

```bash
# 1) Sesión de planificador (cookie en archivo)
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"plan@fero.com","password":"123456789"}' \
  http://localhost:8000/api/v1/auth/login

# 2) Validación pareada (30 corridas, escenario normal) — ~15 min
curl -s -b cookies.txt -X POST \
  'http://localhost:8000/api/v1/validations/statistical?scenarioId=normal&nRuns=30'
```

Equivalente desde la interfaz: panel de validación estadística (rol planificador/administrador).

- Endpoint: `POST /api/v1/validations/statistical?scenarioId=normal&nRuns=30`
- Persistencia: tabla `statistical_validations` (registro `id = 1`, creado **2026-09-22 22:57:33 UTC**)
- Salida cruda: `docs/evidencia/instancia-final/validacion-wilcoxon-normal.json`
- Duración real de la corrida: **880 s (14,7 min)**

### 3.1 Resumen de la prueba

| Métrica | Valor |
|---|---|
| Escenario / corridas | `normal` / 30 (pareadas, semilla fija) |
| Media distancia línea base | 1808,7 km |
| Media distancia optimizada | **1063,3 km** |
| Ahorro medio | **41,2 %** |
| Desviación estándar (optimizado) | 13,24 |
| Estadístico W de Wilcoxon | 465,0 |
| p-valor | **5,47 × 10⁻⁷** |
| IC 95 % de la diferencia (bootstrap) | **[740,6 ; 749,8]** (no incluye el cero) |
| ¿Significativo? | **Sí** |

### 3.2 Detalle de las 30 corridas pareadas

| Semilla | km base | km optimizado | Ahorro |
|---|---|---|---|
| 1 | 1808,7 | 1067,8 | 41,0 % |
| 2 | 1808,7 | 1098,1 | 39,3 % |
| 3 | 1808,7 | 1056,2 | 41,6 % |
| 4 | 1808,7 | 1085,0 | 40,0 % |
| 5 | 1808,7 | 1085,0 | 40,0 % |
| 6 | 1808,7 | 1085,0 | 40,0 % |
| 7 | 1808,7 | 1085,0 | 40,0 % |
| 8 | 1808,7 | 1085,0 | 40,0 % |
| 9 | 1808,7 | 1074,9 | 40,6 % |
| 10 | 1808,7 | 1057,5 | 41,5 % |
| 11 | 1808,7 | 1057,5 | 41,5 % |
| 12 | 1808,7 | 1048,4 | 42,0 % |
| 13 | 1808,7 | 1048,4 | 42,0 % |
| 14 | 1808,7 | 1048,4 | 42,0 % |
| 15 | 1808,7 | 1055,9 | 41,6 % |
| 16 | 1808,7 | 1055,9 | 41,6 % |
| 17 | 1808,7 | 1057,5 | 41,5 % |
| 18 | 1808,7 | 1057,5 | 41,5 % |
| 19 | 1808,7 | 1057,5 | 41,5 % |
| 20 | 1808,7 | 1057,5 | 41,5 % |
| 21 | 1808,7 | 1057,5 | 41,5 % |
| 22 | 1808,7 | 1057,5 | 41,5 % |
| 23 | 1808,7 | 1057,5 | 41,5 % |
| 24 | 1808,7 | 1057,5 | 41,5 % |
| 25 | 1808,7 | 1057,5 | 41,5 % |
| 26 | 1808,7 | 1057,5 | 41,5 % |
| 27 | 1808,7 | 1057,5 | 41,5 % |
| 28 | 1808,7 | 1057,5 | 41,5 % |
| 29 | 1808,7 | 1057,5 | 41,5 % |
| 30 | 1808,7 | 1057,5 | 41,5 % |

La línea base es idéntica en todas las corridas (1808,7 km) porque el diseño es pareado: en cada corrida se resuelve la ruta estática y la optimizada sobre la misma instancia.

---

## 4. Cobertura frente a lo que exige el Capítulo V

| Elemento del Capítulo V | Estado | Fuente |
|---|---|---|
| TABLA 5.1 — Matriz definitoria de KPIs | Se mantiene (definiciones de §4) | Documento de tesis |
| TABLA 5.2 — Parámetros de inicialización | Se mantiene: α = 1,0 · β = 3,0 · ρ = 0,12 · hormigas 12 · iteraciones 20 | §5 y perfil ACO de la corrida |
| TABLA 5.3 — Matriz comparativa por escenario | ✅ Generada | §2 de este documento |
| FIGURA 5.1 — Comparativa de km y combustible | ✅ Datos disponibles | §2 de este documento |
| FIGURA 5.2 — Evolución temporal de la tasa de desborde | ❌ **Sin fuente** | Ver §6 |
| TABLA 5.4 — Resumen de la prueba de Wilcoxon | ✅ Generada | §3 de este documento |

---

## 5. Reproducción paso a paso

```bash
# 1. Instancia limpia (borra la base y resiembra los 300 puntos)
just db-reset

# 2. Comparativa base vs optimizado (no toca la BD)
just phase0-baseline

# 3. Validación estadística (requiere stack arriba)
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"plan@fero.com","password":"123456789"}' \
  http://localhost:8000/api/v1/auth/login
curl -s -b cookies.txt -X POST \
  'http://localhost:8000/api/v1/validations/statistical?scenarioId=normal&nRuns=30'

# 4. Comprobación de salud
just health
```

Comprobar en PostgreSQL:

```bash
./scripts/compose.sh exec -T db psql -U feromap -d feromap -c \
  "SELECT scenario_id, n_runs, mean_distance_current, mean_distance_optimized, saving_pct, wilcoxon_p_value, is_significant FROM statistical_validations;"
```

---

## 6. Limitaciones y pendientes

1. **FIGURA 5.2 no tiene origen de datos.** No existe endpoint ni artefacto que produzca la serie temporal de desborde por jornada (Escenario A vs C). En el backend solo hay conteo de desborde por zona para el panel de monitoreo y términos de desborde internos del optimizador. Hay que derivarla aparte o retirarla del capítulo.
2. **Solo se validó `normal`.** Si el capítulo declara significancia para los tres escenarios, faltan `rain` y `saturated` (≈15 min cada uno).
3. **Evidencia de fases 3, 12 y 13 desactualizada.** `data/cache/phase3/` (17 sep), `data/cache/phase13/` (15 sep) y `data/cache/benchmarks/` (11 sep) pertenecen a instancias anteriores; si el documento las cita, regenerar con `just phase3-sensitivity` + `just phase3-report`, `just phase13-sweep` y `just benchmark-aco`. El archivo `data/cache/seed_epoch.json` marca la instancia vigente.
4. **La comparativa anterior contradecía la tesis.** El `phase0-baseline-metrics.json` del 27-ago reportaba al optimizador *peor* que la línea base (29,0 → 31,1 km en `normal`). Ese archivo quedó reemplazado por el de la instancia final.
5. **Cifras del documento por actualizar:** 300 puntos (no 80/180), 91 sectores, 121.200 hab (no ≈90.000), grafo 2.363/5.467 (no 1.618/3.663) y 46 puntos fuera del *bounding box* declarado.
