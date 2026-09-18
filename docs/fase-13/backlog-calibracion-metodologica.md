# Backlog de ejecución — Calibración metodológica del motor

| Campo | Valor |
|-------|-------|
| **Propósito** | Lista de trabajo ejecutable: qué queda, en qué orden, con qué comando y con qué criterio de aceptación |
| **Fecha** | 2026-09-18 |
| **Relación** | Ejecuta [plan-calibracion-metodologica.md](./plan-calibracion-metodologica.md) — **el plan es la fuente del *porqué*; este documento es la fuente del *estado* y del *cómo***. La **réplica paso a paso** (y qué hacer con otro dataset) está en [pipeline-prueba.md](./pipeline-prueba.md) |
| **Ámbito** | `backend/` (servicios, scripts, tests) y documentación. **No se toca el algoritmo**: `aco_parallel.py` y `_aco_cvrp` quedan intactos |

## Cómo usarlo

Basta decir **«ejecuta E2»**, **«ejecuta E1–E4»** o **«ejecuta todo el backlog»**. Cada tarea es autocontenida: implementación, comando, coste y aceptación. Las decisiones ya cerradas (§2) **no se vuelven a discutir**; las abiertas están en §5 y son las únicas que requieren tu respuesta.

---

## 1. Estado actual

| Pieza | Estado | Evidencia |
|---|---|---|
| Instrumentación de contexto (C0) | ✅ | 10 campos por corrida + `budget` en la raíz + huella `engine` |
| Ruido base (C1) | ✅ | `calibration_sweeps` id 2 · σ = 3.4 km, δ = 5.07 km, n = 6 necesario (10 usados) |
| Protocolo de presupuesto (C2) | ✅ | 0.11 s de ACO por iteración; convergencia mediana 8, peor 20 |
| Factorial 2⁴ (C3.1) | ✅ | id 4 · 200 corridas, 59.3 min · β −45.8, α −35.0, α×β +33.1, paciencia −6.1 (todos Holm-significativos); ρ inerte |
| CLI del protocolo | ✅ | 9 subcomandos (`noise`…`report`), `--reuse`, `--run-id`, `--reference-run-id`, `--dry-run`, `--delta`, `--resume`, `--profile`, latido por corrida |
| C3.2 · eje de presupuesto | ✅ | id 7 · 50 corridas, 17.3 min · `I = 20` (el brazo creciente no mejora > δ); trabajo fijo 3/3 equivalentes, más barato `(8,30)` |
| C3.3 · brazo sin corte | ✅ | id 9 · 20 corridas, 6.3 min · estándar (P5) Δ = −1.1 km IC [−6.0, 0.0] (sin evidencia de equivalencia); mejor de C3 (P10) Δ = 0 (su corte nunca actuaba) |
| C4 · razón β/α y Q | ✅ | id 11 · 60 corridas, 17.5 min · **la razón NO gobierna el orden** (H5 refutada: r=2.5 vs r=5 con misma β equivalentes; misma r=2.5 con α distinta difiere 8.2 km) · Q inerte dentro del ruido |
| Síntesis de la recomendación (E4) | ✅ | `recommend_profile` · mueve **solo β (3→5)**; α, ρ, P y Q se quedan en el estándar por efecto no material o acoplado; perfil `α1 β5 ρ0.12 Q1 P5 · 12×20` |
| C5 · RSM local (β, ρ, I) | ✅ | id 15 · 150 corridas, 28.8 min · β lineal −7.25 (Holm 0.018), curvatura β² +3.31 (Holm 0.078) → óptimo interior; meseta **β ∈ [4.7, 10]**, ρ ∈ [0.06, 0.24] e I ∈ [10, 40] planas dentro de δ; centros idénticos (determinismo) |
| C6 · validación de la combinación | ✅ | id 13 · 20 corridas, 3.9 min · Δ = −4.6 km IC [−9.5, 0.25] · **no concluyente**: ni equivalente (IC ⊄ ±δ) ni mejora material (IC cruza el umbral y el cero). Wilcoxon p = 0.049; TOST p = 0.44 |
| C7 · pesos del objetivo | ✅ | id 20 · 30 corridas, 8.6 min · candidatas = referencia (`w=0`) + un representante por punto no dominado del bloque de 8 h (`makespan 0.5`, `makespan 5`); AC-1 **sí** sobre la mediana (todas ≤ 1.15×), AC-2 **no** (el bloque deja 8–9 puntos sin cubrir → no hay punto aceptado); frontera de medianas + hipervolumen con IC |
| C8 · reporte | ✅ | `just calib-report` → `docs/fase-13/evidencia-calibracion-metodologica.md` (0 CPU) · cita la corrida más completa de cada fase; **T1–T9** + síntesis + **figuras F1–F4 en PNG** junto al documento (`f1-convergencia.png`…`f4-frontera.png`) |
| E0 · persistencia incremental | ✅ | Salvavidas `data/cache/phase13/method-<fase>.jsonl` (una línea por corrida terminada) + `--resume`; la fila de `calibration_sweeps` se sigue escribiendo al final y el fichero se borra al guardar. Test: cortar a mitad y reanudar ejecuta solo las que faltan y produce el mismo payload |
| Evidencia para la vista (Camino A) | ✅ | `GET /benchmarks/calibration/method` · datos + `recommendation` + **sello de instancia por fase** (`cacheState`/`stalePhases`) desde la BD (0 CPU) · panel `MethodEvidencePanel` con aviso de instancia ajena + «Aplicar perfil recomendado» |
| Job por fase (Camino B) | ✅ | `POST /benchmarks/calibration/method/jobs` (`phase`, `seeds`, `resume`, `refresh`) · `method` entra en `CALIBRATION_SWEEPS`; un job por fase, de 4 a 200 corridas |
| Protocolo completo en un job | ✅ | `phase: "all"` corre las 8 fases en orden (respetando dependencias), con contador global y el rótulo de la fase; `refresh=false` devuelve la evidencia ya guardada (0 CPU) y el resultado del job es la evidencia ensamblada |

Runs existentes en `calibration_sweeps`: **id 2** (noise, 10 semillas), **id 3** (factorial, 3 semillas), **id 4** (factorial, 10 semillas ← **el citable**), **id 5** (factorial, 2 semillas), **id 6** (budget, 2 semillas), **id 7** (budget, 10 semillas ← **el citable**), **id 8** (nocut, 2 semillas), **id 9** (nocut, 10 semillas ← **el citable**), **id 10** (identify, 2 semillas), **id 11** (identify, 10 semillas ← **el citable**), **id 12** (validate, 2 semillas), **id 13** (validate, 10 semillas ← **el citable**), **id 14** (rsm, 2 semillas), **id 15** (rsm, 10 semillas ← **el citable**), **id 16** (nocut, 2 semillas · smoke de `--resume`), **id 17** (validate, 2 semillas · smoke del job por fase), **id 18** (objective, barrido de pesos de 17 filas · evidencia de C7), **id 19** (objective, 2 semillas · fontanería), **id 20** (objective, 10 semillas ← **el citable**). Los ids 3, 5, 6, 8, 10, 12, 14, 16, 17 y 19 son verificaciones de fontanería, no evidencia.

**Verificación de la vista (2026-09-18).** Backend `819 passed`; frontend `379 tests` en 62 archivos y `npm run build` OK (los 81 errores de `tsc` son preexistentes en módulos ajenos; ninguno en los archivos tocados). El salvavidas de E0 se comparte entre consola y vista: las fases usan la **misma** construcción de casos.

## 2. Decisiones cerradas (no volver a discutir)

| Decisión | Valor | Por qué está cerrada |
|---|---|---|
| **δ** | **5.07 km** = 1 % de la referencia voraz (2.7 % de la ruta total, ≈18 min de jornada de flota) | Declarada antes de correr C3; queda por encima del ruido medido (3.4 km), así que la regla de equivalencia discrimina. Coste declarado: no detecta efectos < ~5 km |
| **n** | **10 semillas** | Cota pesimista pedía 6; 10 da coherencia con C1 y IC más estrechos |
| **I** | **20 en el diseño**; 20 vs 40 lo decide E1 | RNF-3 tiene margen (40 iteraciones ≈ 4.4 s de ACO de 15 s) |
| **Semillas** | 42, 101, 202, 303, 404, 505, 606, 707, 808, 909 | Números aleatorios comunes: las mismas para todos los puntos |
| **Escenario** | `normal` | Única instancia del estudio; se declara como límite |
| **Barrido** | `sweep='method'`, fase en `payload["phase"]` | No pisa la evidencia de la vista de calibración |
| **Perfil estándar** | 12 hormigas × 20 iteraciones · α1 β3 ρ0.12 Q1 | Referencia de todo el estudio |

## 3. Reglas de ejecución

1. **Verificación en dos pasos** (decisión D1). Cada tarea se valida primero con **pocas semillas** —`--seeds 42,101`, ≈2 corridas por punto— para comprobar la fontanería: que el barrido corre, que el payload trae el contexto y que el análisis concluye con números sensatos. La corrida **citable** con las 10 semillas se hace después. **Nunca se lanza una corrida larga sin haber pasado el paso corto.**
2. `--dry-run` antes de cualquier barrido nuevo (plan y coste, sin CPU).
3. Cada tarea termina con **la suite del backend en verde**:
   `cd backend && DATA_DIR=<raíz del repo>/data .venv/bin/python -m pytest tests/ -q`
   (sin `DATA_DIR` fallan 3 tests por la ruta `/app/data` del contenedor; es preexistente).
4. **No se toca** `aco_parallel.py` ni `_aco_cvrp` (construcción, 2-opt, objetivo, feromona).
5. Los barridos se lanzan **siempre** por comando y con latido visible; ninguno se lanza sin que la tarea lo indique.
6. Los barridos **solo escriben al final**, así que un corte en la última corrida pierde el barrido entero. E0 (persistencia incremental) sigue **postpuesta** por D1: mientras tanto, **el paso corto es la red de seguridad**.
7. No se hacen commits ni ramas salvo petición explícita.
8. Todo análisis debe poder reejecutarse sobre la evidencia guardada **sin CPU** (`--reuse` / `--run-id N`).

---

## 4. Tareas

### E0 · Persistencia incremental del barrido *(postpuesta por D1)*

**Objetivo.** Que un corte no cueste 59 min. **No se implementa todavía**: por decisión D1, durante la implementación se trabaja con **ejecuciones cortas** (§3.1) y E0 se implementa *bien* cuando el resto del pipeline esté cerrado.

**Implementación prevista.** Volcado de cada corrida terminada a `data/cache/phase13/method-<phase>.jsonl` desde el callback `on_result`, y bandera `--resume` que reutiliza las corridas ya hechas (clave `(caso, semilla)`) y ejecuta solo las que faltan. La fila de `calibration_sweeps` se sigue escribiendo **al final** (ADR-011 intacto: la BD es la verdad; el JSONL es solo un salvavidas de trabajo en curso).

**Comando previsto.** `just calib-factorial --resume`

**Coste.** 0 corridas · ~1 h de implementación + tests.

**Aceptación.** Interrumpir un barrido a mitad y relanzarlo con `--resume` ejecuta solo las corridas que faltan y produce el mismo payload que una corrida completa.

**Estado (2026-09-18).** Implementada. El volcado es **incondicional** (no depende de `--resume`): cada corrida terminada se anexa al JSONL y el fichero se borra al guardar en la BD, así que un corte deja el salvavidas listo sin que nadie tenga que acordarse de activarlo. La clave de reanudación es el **caso declarado completo** (incluida la etiqueta): en el factorial las 4 réplicas del centro comparten parámetros y hubieran colapsado en una sola corrida, pasando el chequeo de determinismo por construcción. `resume=True` es el default del job por fase de la vista.

---

### E1 · C3.2 — Eje de presupuesto

**Objetivo.** Decidir cómo se reparte el presupuesto (hormigas vs iteraciones) y si subir el techo a 40 iteraciones compra algo. Cierra H6.

**Implementación.**
- `calibration_method_service.budget_cases()`: 5 casos — `(8,30)`, `(12,20)`, `(20,12)` a `H × I = 240` + `(12,40)` y `(20,40)` como brazo creciente; resto en el perfil estándar.
- `analyze_budget(payload, *, delta_km)`: mediana/IC por punto, contraste pareado contra `(12,20)` (la referencia), e **iteraciones efectivas**.
- CLI: implementar `phase_budget` (hoy stub).

**Comando.** `just calib-budget` · `just calib-budget --dry-run`

**Coste.** 5 puntos × 10 semillas = 50 corridas ≈ **15 min**.

**Criterio de aceptación.** Declarar `I = 20` o `I = 40` con la regla explícita: *se sube solo si la mediana con 40 mejora más de δ*. La decisión condiciona E5.

---

### E2 · C3.3 — Brazo sin corte

**Objetivo.** Cuantificar cuánta calidad cuesta la regla de parada. C3 ya midió que la paciencia vale 6.1 km; aquí se mide **cuánto deja sobre la mesa**.

**Implementación.**
- `no_cut_cases(best_config)`: perfil estándar y mejor configuración de C3, ambas con `acoPatience = 0`.
- `analyze_no_cut(payload, reference_payload, *, delta_km)`: estadística por configuración (reusa `_stats`) y **comparación pareada entre dos payloads** por `(configuración, semilla)` — mismo par de semillas, distinta regla de parada. Helper compartido por E4 y E5.
- CLI: fase nueva `nocut`.

**Comando.** `just calib-nocut`

**Coste.** 2 puntos × 10 semillas = 20 corridas ≈ **6 min** (sin corte cada corrida agota las 20 ondas).

**Aceptación.** Δ pareado (sin corte − con corte) por configuración, con IC; y el veredicto de si la diferencia supera δ.

---

### E3 · C4 — Razón β/α y validación de Q

**Objetivo.** Probar que lo que gobierna el **orden** de preferencia es `r = β/α` (y que α solo cambia la *nitidez* de la ruleta), y que `Q` es inerte. Es la pieza que desmonta la trampa del OFAT detectada en H5.

**Implementación.**
- `ratio_cases()`: 6 casos con ρ = 0.12, paciencia = 5, 12×20 —
  `r = 5` → (α1, β5) y (α2, β10) · `r = 2.5` → (α1, β2.5) y (α2, β5) · `Q` → (Q0.5) y (Q2).
- `analyze_ratio(payload, *, delta_km)`: contrastes pareados pre-declarados —
  **dentro de r**: (α1β5) vs (α2β10) y (α1β2.5) vs (α2β5) → *deben ser equivalentes*;
  **entre r**: (α2β5) vs (α1β5) → *debe diferir*;
  **Q**: (Q0.5) vs (Q2) → *debe ser equivalente*. Holm sobre la familia de 4.
- CLI: implementar `phase_identify`.

**Comando.** `just calib-identify`

**Coste.** 6 puntos × 10 semillas = 60 corridas ≈ **18 min**.

**Aceptación.** Veredicto explícito: «la razón gobierna el orden: sí/no» + «Q inerte dentro del ruido: sí/no». Si sale «no» en lo primero, se cae H5 y hay que reescribir la recomendación de α y β como par.

---

### E4 · Síntesis de la recomendación, factor a factor

**Objetivo.** Producir el perfil recomendado **usando la evidencia por factor**, no copiando la mejor fila. Corrige el hueco detectado al analizar C3: el «mejor config» traía ρ = 0.3 sin evidencia a favor (ρ es inerte).

**Implementación.** `recommend_profile(factorial_analysis, ratio_analysis | None, *, delta_km)` → por factor:
- **efecto material y significativo** → mover la perilla al nivel mejor;
- **efecto no material** → **quedarse en el estándar** (α1 β3 ρ0.12 Q1);
- **par acoplado** (si α×β es material) → recomendar `r = β/α` y no los dos valores sueltos;
- **regla de parada** → el nivel de paciencia que la evidencia sostenga, declarando su coste en ondas.
Salida: perfil + justificación por perilla + advertencias (p. ej. «este valor está en el borde del rango medido»).

**Comando.** `just calib-report --profile` (depende de E8 para el formato) o invocación directa del análisis.

**Coste.** 0 corridas · ~1 h + tests.

**Aceptación.** El perfil recomendado y el estándar quedan definidos y comparables; ninguna perilla se mueve sin efecto significativo y material que lo respalde.

---

### E5 · C6 — Validación replicada de la combinación

**Objetivo.** **La única tarea que produce un veredicto** sobre la recomendación. Cierra el circuito que el OFAT dejó abierto.

**Implementación.**
- `validation_cases(recommended)`: perfil estándar (control) + perfil recomendado de E4.
- `analyze_validation(payload, *, delta_km)`: Δ pareado por semilla, IC bootstrap, Wilcoxon bilateral, **TOST contra ±δ** y veredicto `better` / `equal` / `worse` / `not-comparable`.
- CLI: implementar `phase_validate`.

**Comando.** `just calib-validate`

**Coste.** 2 puntos × 10 semillas = 20 corridas ≈ **6 min** (con el `I` que decida E1).

**Aceptación.** Veredicto con IC y con el **mismo δ** del resto del plan. Si sale `equal`, la recomendación se sostiene **por coste y por no desviarse del estándar**, y se declara así.

---

### E6 · C7 — Pesos del objetivo con réplicas

**Objetivo.** Que la frontera de Pareto y AC-1/AC-2 dejen de apoyarse en una corrida.

**Implementación.** `objective_candidate_cases()` con las filas candidatas del bloque de 8 h del barrido de pesos (`multiobjective_sweep_service`), replicadas con las 10 semillas; `analyze_objective(payload, *, delta_km)` con AUC de la frontera con IC y AC-1/AC-2 sobre la **mediana** (no sobre un valor puntual).

**Comando.** `just calib-objective`

**Coste.** ~5 filas × 10 semillas = 50 corridas ≈ **15 min**. Medido: 3 filas × 10 semillas = 30 corridas ≈ **8.6 min**.

**Aceptación.** Frontera con IC y ambas condiciones evaluadas con su intervalo.

**Estado (2026-09-18).** Implementada. El barrido de 17 pesos (id 18, 6×10) dejó **todos** los puntos del bloque de 8 h sin cubrir (8–10 puntos), así que con esta instancia **AC-2 no se sostiene**, no existe «punto aceptado» y la frontera del bloque no tiene región de aceptación. `objective_candidate_cases(source)` replica las **candidatas** —la referencia (`w=0`) más un representante por punto no dominado del bloque (`makespan 0.5` y `makespan 5`)— con el presupuesto del protocolo (12×20, paciencia 0), y `analyze_objective` evalúa AC-1/AC-2 **sobre la mediana** con IC bootstrap (`_ratio_median_ci`) y mide la frontera como área dominada (hipervolumen) con IC. Corrida citable **id 20** (30 corridas, 8.6 min): AC-1 se cumple (todas las medianas ≤ 1.15× la referencia), AC-2 no (hasta 9 puntos sin cubrir), `makespan 0.5` equivalente dentro de δ (Δ = 1.2 km, IC [−2.0, 2.4]) y `makespan 5` mueve 8.0 km (IC [−1.1, 12.0]). El δ de C7 se pasa **explícito** (5.07 km): la referencia voraz del bloque de 8 h (387 km) no es la del perfil estándar (507 km) y derivar 1 % de ella cambiaría el δ declarado. La figura **F4** se genera con esta evidencia.

---

### E7 · C5 — Superficie de respuesta local

**Objetivo.** Forma fina de la superficie y **meseta de equivalencia**. Entra por decisión D2: la curvatura de −18.8 km que midió C3 demuestra que el modelo lineal no basta y que β tiene óptimo interior.

**Implementación.** Box-Behnken de 3 factores (`r = β/α`, `ρ`, `I`): 12 puntos + 3 centros; ajuste de segundo orden por mínimos cuadrados (`numpy.linalg.lstsq`) sobre 10 coeficientes; lectura de la meseta (±δ).

**Comando.** `just calib-rsm`

**Coste.** 15 puntos × 10 semillas = 150 corridas ≈ **44 min**.

**Aceptación.** Coeficientes con IC y la región declarada donde mover las perillas no degrada más de δ.

---

### E8 · C8 — Reporte del capítulo

**Objetivo.** Ensamblar tablas y figuras desde la BD, por comando.

**Implementación.** `just calib-report` → `docs/fase-13/evidencia-calibracion-metodologica.md`, reutilizando `format_noise_analysis`, `format_factorial_analysis` y los nuevos formateadores; más T1 (protocolo y trazabilidad), T2 (ruido y umbrales), T8 (validación) y la síntesis de E4. Lee de `calibration_sweeps` con `--run-id`.

**Coste.** 0 corridas.

**Aceptación.** El documento se regenera desde la BD y contiene: protocolo declarado, ruido y δ derivado, efectos con Holm, curvatura, síntesis por factor y veredicto de validación.

---

## 5. Decisiones resueltas (2026-09-18)

No queda ninguna decisión abierta: este backlog se puede ejecutar de corrido.

| # | Decisión | Resolución | Consecuencia en este documento |
|---|---|---|---|
| **D1** | ¿E0 (persistencia) antes de seguir? | **Sí, pero después**: por ahora se trabaja con **ejecuciones cortas** para validar la fontanería y E0 se implementa bien al final | §3.1 (protocolo de verificación en dos pasos) y E0 marcada como postpuesta |

> **Actualización (2026-09-18).** D1 se levantó a petición: E0 está implementada (§4) y es el prerrequisito del botón de lanzar por fase de la vista de calibración.
| **D2** | ¿E7 (RSM) entra o se recorta? | **Entra** | E7 pasa de «recortable» a tarea de pleno derecho |
| **D3** | Renombrar las fases | **Sí**: las fases del plan pasan de **C0–C8 a C0–C8** (`C` de calibración) | Hecho en el plan y en este backlog; las **figuras** siguen siendo C1–C4, así que el renombrado además desambigua |
| **D4** | Perfil a validar en E5 | **El que salga de E4** (evidencia), sobreescribible | E5 depende de E4; si no hay perfil de E4, E5 no se lanza |

## 6. Orden recomendado y coste total

```mermaid
flowchart LR
    E1[E1 · C3.2 presupuesto] --> E2[E2 · C3.3 sin corte]
    E2 --> E3[E3 · C4 razon]
    E3 --> E4[E4 · sintesis]
    E4 --> E5[E5 · C6 validacion]
    E5 --> E6[E6 · C7 pesos]
    E6 --> E7[E7 · C5 RSM]
    E7 --> E8[E8 · C8 reporte]
    E8 -.-> E0[E0 · persistencia<br/>postpuesta]
```

Por tarea, el trabajo es **implementar → paso corto → corregir → corrida citable**:

| Tarea | Paso corto (2 semillas) | Corrida citable (10 semillas) |
|---|---|---|
| E1 · presupuesto | 10 corridas ≈ 3 min | 50 corridas ≈ 15 min |
| E2 · sin corte | 4 ≈ 1 min | 20 ≈ 6 min |
| E3 · razón | 12 ≈ 4 min | 60 ≈ 18 min |
| E4 · síntesis | 0 | 0 |
| E5 · validación | 4 ≈ 1 min | 20 ≈ 6 min |
| E6 · pesos | 10 ≈ 3 min | 50 ≈ 15 min |
| E7 · RSM | 30 ≈ 9 min | 150 ≈ 44 min |
| E8 · reporte | 0 | 0 |
| **Total** | **70 corridas ≈ 21 min** | **350 corridas ≈ 1.7 h** |

**Camino crítico hasta una recomendación defendible: E1 → E2 → E3 → E4 → E5** (≈ 45 min de CPU citable, ≈ 9 min en pasos cortos). E6 y E7 blindan la defensa; E0 va al final por decisión D1.

## 7. Qué NO se hace

| No hacer | Por qué |
|---|---|
| Tocar `aco_parallel.py` o `_aco_cvrp` | El algoritmo está fuera de alcance; se calibra, no se rediseña |
| Replicar el barrido completo de 17 pesos | Solo las filas candidatas (E6) |
| Sustituir o añadir otro metaheurístico "para comparar" | No valida la parametrización del ACO y abre un flanco |
| Elegir δ o n después de ver los resultados | Convertiría el umbral en un resultado |
| Declarar equivalencia con un test no significativo | Ausencia de evidencia ≠ evidencia de ausencia: se usa IC/TOST contra δ |
| Ampliar la huella otra vez sin motivo | Invalidaría la evidencia de C1–C3 (ids 2–5) |
| Perseguir significancia con 30+ semillas | Con CRN, n = 10 y δ declarado es suficiente |
