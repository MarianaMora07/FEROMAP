# Checklist de aceptación — Defensa de tesis

Criterios verificables para considerar exitoso el rediseño del flujo guiado de Simulación (Opción A).

**Cómo usar:** marcar cada ítem tras verificación manual o con `just defense-verify`.  
**Responsable:** planificador / administrador de prueba.  
**Entorno:** stack levantado con `just setup` o `just up` + `just migrate` + `just seed`.  
**Estado global:** ✅ **Completado** — Fase 6 (2026-08-08)

---

## A. Navegación y descubrimiento

- [x] **A1.** Desde Dashboard, en **≤ 2 clics** llego a `/simulation` (CTA "Nueva simulación").
- [x] **A2.** El ítem **Simulación** aparece **antes** que Optimización en el menú lateral (planificador/admin).
- [x] **A3.** El CTA primario del Dashboard es Simulación; Optimización es secundaria o no compite visualmente.
- [x] **A4.** En `/optimization` hay texto que orienta: *"Para evaluar escenarios, usa Simulación"*.
- [x] **A5.** Un usuario nuevo identifica dónde iniciar una simulación en **< 30 segundos** sin ayuda verbal. *(Ver [informe-prueba-usabilidad.md](../fase-6/informe-prueba-usabilidad.md))*

---

## B. Flujo guiado de simulación

- [x] **B1.** El wizard muestra 3 pasos claros: Configuración → Ejecutar → Resultados.
- [x] **B2.** El botón principal del paso 2 dice **"Ejecutar simulación"** (no "Optimizar rutas con IA").
- [x] **B3.** Antes de ejecutar, veo el **escenario derivado** (ej. "Tráfico pico") según condiciones elegidas.
- [x] **B4.** Si no hay vehículos asignables, el sistema muestra error/aviso claro (no falla silenciosamente).
- [x] **B5.** Durante la ejecución veo progreso y/o logs del motor.
- [x] **B6.** Al terminar, los KPIs comparativos (actual vs optimizado) son visibles sin cambiar de página.
- [x] **B7.** Puedo completar una simulación end-to-end **sin salir de `/simulation`**.

---

## C. Honestidad de variables (Fase 3)

- [x] **C1.** Ningún control activo implica un efecto que no esté documentado en la matriz de variables.
- [x] **C2.** Variables no conectadas están ocultas, deshabilitadas o etiquetadas como "Próximamente" / "Solo informativo".
- [x] **C3.** Puedo explicar en defensa qué hace cada toggle de condición (mapeo a `scenarioId`).
- [x] **C4.** El selector de algoritmo no sugiere GA/SA si el backend solo ejecuta ACO (o está etiquetado).

---

## D. Resultados y seguimiento

- [x] **D1.** Tras ejecutar, hay acciones visibles: ver mapa, analítica, reporte, nueva simulación.
- [x] **D2.** Puedo acceder al historial de simulaciones desde `/simulation`.
- [x] **D3.** Dashboard muestra la **última simulación** con enlace a resultados.
- [x] **D4.** Exportación CSV/PDF funciona desde Reportes con datos de simulaciones reales.
- [x] **D5.** Analítica muestra agregados coherentes con la última corrida.

---

## E. Separación Simulación vs Optimización (Opción A)

- [x] **E1.** Simulación se percibe como flujo principal de evaluación de escenarios.
- [x] **E2.** Optimización se percibe como herramienta operativa de planificación diaria.
- [x] **E3.** No es necesario explicar "por qué hay dos pantallas parecidas" durante la demo.
- [x] **E4.** Ambos módulos comparten el mismo motor sin desincronizar historial/KPIs. *(Historial operativo filtrado — Fase 5)*

---

## F. Robustez técnica

- [x] **F1.** `GET /health` responde 200 con stack levantado.
- [x] **F2.** Login con `plan@fero.com` / `123456789` funciona.
- [x] **F3.** `POST /api/v1/simulations/optimize` completa sin error 500.
- [x] **F4.** `just defense-verify` pasa (o equivalente manual documentado). *(2026-08-08, dev)*
- [x] **F5.** Tras `just up` en entorno limpio, `just migrate` + `just seed` dejan el flujo usable.

---

## G. Demo de defensa (5–7 min)

- [x] **G1.** Guion de demo ensayado: escenario tráfico → ejecutar → KPIs → analítica. *(Ver [guion-demo-defensa.md](../fase-6/guion-demo-defensa.md))*
- [x] **G2.** Demo completable en **≤ 7 minutos** sin atajos técnicos (curl, consola).
- [x] **G3.** Capturas o diagrama de flujo incluidos en documentación de tesis. *(Ver [evidencias-implementacion.md](../fase-6/evidencias-implementacion.md))*

---

## Resumen de aceptación

| Bloque | Ítems | Completados |
|--------|-------|-------------|
| A — Navegación | 5 | 5/5 |
| B — Flujo guiado | 7 | 7/7 |
| C — Variables | 4 | 4/4 |
| D — Seguimiento | 5 | 5/5 |
| E — Separación | 4 | 4/4 |
| F — Técnica | 5 | 5/5 |
| G — Demo | 3 | 3/3 |
| **Total** | **33** | **33/33** |

**Definición de terminado global:** ✅ Cumplida (Fase 6).
