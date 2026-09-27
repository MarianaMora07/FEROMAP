# Checklist — actualización de documentos tras la reproducibilidad

> Generado por la implementación de `docs/plan-reproducibilidad-evaluacion.md`
> (Fases 1–4). **No se reescribió ningún documento de evidencia ni la tesis**: este
> archivo solo lista qué líneas hay que tocar cuando se **regenere la evidencia**.
>
> Los números citados abajo corresponden a las líneas actuales de cada archivo; si se
> edita antes cualquiera de ellos, reubicar por el texto de referencia, no por el número.

## 0. Artefactos por regenerar

**Estado (2026-09-24):**

| Artefacto | Cómo se produce | Destino versionado | Estado |
|---|---|---|---|
| `data/cache/phase0-baseline-metrics.json` (5 escenarios) | `just phase0-baseline` | `docs/evidencia/instancia-final/phase0-baseline-metrics.json` | ✅ Regenerado y copiado |
| `data/cache/statistical-validations.json` (5 escenarios) | `just wilcoxon` | `docs/evidencia/instancia-final/statistical-validations.json` | ✅ Regenerado y copiado (N=30 · Holm) |

Comandos (desde la raíz del repo, stack arriba). El Wilcoxon corre **en paralelo por semilla**
(`--workers`, default min(núcleos, 8)) y admite `--quick` (10 corridas) para iterar:

```bash
just phase0-baseline                      # 5 escenarios, caché caliente (~1 min)
just wilcoxon                             # los 5 escenarios, N=30 (~4 min con --workers 8)
just wilcoxon --scenario normal --quick   # un escenario, 10 corridas (iteración)
just wilcoxon --workers 8                 # N=30 con 8 procesos
```

Equivalente por API (sin `just`):

```bash
curl -s -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"email":"plan@fero.com","password":"123456789"}' \
  http://localhost:8000/api/v1/auth/login
curl -s -b cookies.txt -X POST \
  'http://localhost:8000/api/v1/validations/statistical?scenarioId=normal&scenarioId=peak_traffic&scenarioId=rain&scenarioId=saturated&scenarioId=broken_vehicle&nRuns=30'
```

---

## 1. `docs/fase-0/alineacion-defensa.md`

| Línea(s) | Texto actual | Cambio |
|---|---|---|
| L68 | `| Contenedores activos | 20 |` | Verificar contra la instancia de 300 puntos (`docs/evidencia-instancia-final.md` §1). |
| L77-79 | filas `normal` / `lluvia` / `saturado` (29,0→31,1 · 29,0→31,1 · 29,0→44,8) | Reemplazar por las filas del nuevo JSON (5 escenarios) y añadir **tráfico pico** y **avería**. |
| L81 | `**Tiempo de cómputo:** ~8 s por escenario (grafo + matriz en caché).` | Alinear con `computationSeconds` en caliente y describir el desglose (`graphLoadSeconds`/`acoSeconds`/`overheadSeconds`, `cacheState: "warm"`). |
| L85-88 | interpretación "los tres escenarios" / "Lluvia vs normal" | Ajustar a cinco escenarios. |
| L110 | "Actualizar la tabla de la §3 y la fecha…" | Actualizar fecha al regenerar. |

## 2. `docs/evidencia-instancia-final.md`

| Línea(s) | Texto actual | Cambio |
|---|---|---|
| L5 | `Regenerar: just db-reset → just phase0-baseline → validación estadística por API (ver §5)` | Añadir `just wilcoxon` y "5 escenarios". |
| L17, L23-24 | un solo JSON de Wilcoxon (`validacion-wilcoxon-normal.json`) | Añadir `statistical-validations.json` (5 escenarios). |
| L26 | "habría que regenerarla (≈15 min por escenario)" | Aclarar que ahora es `just wilcoxon` (~75 min los 5). |
| L63-65 | `Escenarios: normal, rain, saturated` | → los 5 (`normal, peak_traffic, rain, saturated, broken_vehicle`). |
| L68-72 | tabla de 3 escenarios + columna cómputo 10,3/10,7/10,9 | 5 filas, añadir **Críticos** (`criticalCoveragePct`) y cómputo en caliente. |
| L82 | "Se dispara por API con sesión de planificador (no hay receta `just`)" | **Ya sí hay receta**: `just wilcoxon`. |
| L84-93 | bloque `curl` | Añadir la variante con `scenarioIds` repetidos (o referenciar `just wilcoxon`). |
| L104-114 | §3.1 sin tamaño de efecto | Añadir filas **r (rangos-biserial)** y **d_z** — ya las produce la suite. |
| L191-193 | consulta `psql` de `statistical_validations` | Añadir `effect_size_r, effect_size_dz, n_effective`. |
| L200 | "Solo se validó `normal`." | Resuelto: ahora se validan los 5. |

## 3. `docs/evidencia-fase-vi-resultados.md`

| Línea(s) | Texto actual | Cambio |
|---|---|---|
| L32-35 | lista de comandos (`just phase0-baseline` 3 escenarios) | Añadir `just wilcoxon`; el baseline ya es de 5. |
| L39-45 | tabla §3 (5 filas) | Regenerar; añadir **Críticos**; el cómputo pasa a caliente y reproducible. |
| L47 | rangos de cómputo "(5,5 – 6,1 s…)" | Actualizar con el nuevo desglose. |
| L74-89 | §4: nota "Tamaño del efecto (no lo reporta la suite…)" | **Ya lo reporta**: retirar la coletilla y tomar r/d_z del JSON. |
| L93-94 | §5 pendientes 1 y 2 | Actualizar: la tabla se puebla con `just wilcoxon`; ya no es solo `normal`. |

## 4. `tesis/tesis.md` (⚠️ no tocar sin confirmación del usuario)

| Línea(s) | Texto actual | Cambio |
|---|---|---|
| L852-858 | TABLA 5.3 (5 filas) y columna `Cómputo (s)` = 5,9 / 17,6 / 5,5 / 6,1 / 17,4 | Regenerar con `just phase0-baseline` (caliente); el cómputo deja de mezclar corridas. |
| L862 | FIGURA 5.2 definida como *cobertura de puntos totales y críticos* | **Discrepancia**: `docs/evidencia-instancia-final.md` §4 la define como *tasa de desborde*. Unificar. |
| L868-883 | TABLA 5.4 con r (rangos-biserial) y d_z (56,29) | Ya es reproducible (`just wilcoxon` / endpoint). |
| L866, L887 | narrativa "N=30 … escenario normal" | Decidir si la validación se extiende a los 5 escenarios (o se mantiene `normal`) y redactar en consecuencia. |

---

## 5. Notas de trazabilidad

- Cada fila nueva debería citar `generatedAt` y el `instanceFingerprint`
  (`backend/app/services/instance_fingerprint.py`) para poder auditar el snapshot.
- **`broken_vehicle` standalone**: es el escenario de parámetros (×1,10 + 5 pp), **no**
  la re-optimización reactiva — aclararlo donde se cite la fila "avería".
- Los snapshots previos (3 escenarios / solo `normal`) quedan como históricos hasta que se
  regeneren; no borrarlos sin generar los nuevos.
