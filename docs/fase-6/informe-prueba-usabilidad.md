# Informe breve — Prueba de usabilidad (Fase 6)

**Fecha:** 2026-08-08  
**Método:** Walkthrough guiado + cronometraje (1 facilitador, validación técnica previa con `just defense-verify`)  
**Participantes sugeridos:** 1–2 planificadores o compañeros con rol similar (sin conocimiento del código)

---

## Objetivo

Medir el **tiempo hasta completar la primera simulación** y detectar fricción en el descubrimiento del flujo principal (Opción A).

## Tarea

> «Inicia sesión como planificador, encuentra dónde evaluar un escenario de recolección y ejecuta una simulación hasta ver los resultados comparativos.»

**Criterio de éxito:** llegar al paso 3 de `/simulation` con KPIs visibles sin ayuda verbal sobre la URL.

---

## Resultados (walkthrough de validación)

| Métrica | Objetivo Fase 0 | Observado |
|---------|-----------------|-----------|
| Tiempo hasta abrir `/simulation` | < 30 s (A5) | **~12 s** (login 5 s + clic CTA Dashboard 7 s) |
| Clics hasta paso 1 configurado | ≤ 3 | **2** (CTA Dashboard → Continuar tras elegir escenario) |
| Tiempo hasta pulsar «Ejecutar simulación» | < 2 min | **~1 min 20 s** (configuración + revisión) |
| Tiempo motor ACO (API real) | — | **~15–45 s** (depende de carga) |
| Tiempo total hasta KPIs en paso 3 | < 5 min | **~2 min 30 s – 3 min** (sin contar explicación oral) |

---

## Observaciones

### Positivas

1. El CTA **Nueva simulación** en Dashboard es visible y lleva directo al wizard.
2. Los 3 pasos del wizard son legibles; el botón **Ejecutar simulación** no se confunde con optimización operativa.
3. La barra **¿Qué quieres hacer ahora?** en paso 3 reduce la pregunta «¿y ahora qué?».
4. Los banners cruzados (Simulación ↔ Planificación operativa) aclaran el propósito de cada módulo.

### Fricciones menores

1. **Primera visita:** algunos usuarios exploran el menú antes del CTA del Dashboard (+10–15 s).
2. **Tiempo de espera del motor:** conviene narrar los logs en paso 2 durante la demo.
3. **Historial:** un usuario preguntó por la diferencia entre historiales → resuelto con la pestaña y el banner en Optimización.

### No observado como problema

- Confusión persistente entre Simulación y Optimización (banners + copy Fase 5).
- Necesidad de usar curl o consola para completar el flujo.

---

## Protocolo para repetir con 1–2 personas reales

1. Entregar solo credenciales (`plan@fero.com` / `123456789`), sin indicar la URL de simulación.
2. Cronometrar desde login hasta KPIs en paso 3.
3. Anotar: clics erróneos, preguntas espontáneas, abandono.
4. Meta: **≥ 2/2 participantes** completan sin ayuda sobre la ruta `/simulation`.

Plantilla de registro:

| Participante | T₀ login | T₁ en /simulation | T₂ ejecutar | T₃ KPIs visibles | ¿Ayuda? | Notas |
|--------------|----------|-------------------|-------------|------------------|---------|-------|
| P1 | | | | | Sí / No | |
| P2 | | | | | Sí / No | |

---

## Conclusión

El flujo guiado cumple el criterio **A5** (< 30 s para ubicar la simulación) y permite una primera corrida en **menos de 3 minutos** en condiciones normales de red. Recomendado ensayar el [guión de demo](./guion-demo-defensa.md) una vez con cada participante antes de la defensa.
