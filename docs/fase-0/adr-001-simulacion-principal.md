# ADR-001: Simulación como flujo principal; Optimización operativa secundaria

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado |
| **Fecha** | 2026-08-08 |
| **Fase** | 0 — Alineación |
| **Decisión** | Opción A |

## Contexto

FEROMAP expone dos pantallas con funcionalidad solapada:

- **`/simulation`** — wizard de escenarios, condiciones, KPIs.
- **`/optimization`** — formulario operativo, restricciones, despacho.

Ambas invocan el mismo endpoint (`POST /api/v1/simulations/optimize`) con `{ scenarioId }`.  
La navegación actual coloca **Optimización antes que Simulación**, y el Dashboard enlaza a Optimización. Esto genera confusión para:

1. El planificador que quiere evaluar escenarios (objetivo de tesis).
2. El evaluador en defensa que espera un flujo guiado reproducible.

Además, varios controles de UI no están conectados al motor, lo que aumenta el riesgo de preguntas incómodas en la defensa.

## Decisión

Adoptar la **Opción A**:

| Módulo | Rol | Prioridad |
|--------|-----|-----------|
| **Simulación** (`/simulation`) | Flujo principal de evaluación de escenarios y desempeño del algoritmo | Alta — entrada por defecto |
| **Optimización** (`/optimization`) | Herramienta operativa para planificación diaria y despacho de rutas | Baja — acceso secundario |

### Reglas de producto

1. El **CTA primario del Dashboard** apunta a Simulación, no a Optimización.
2. Simulación aparece **antes** que Optimización en el menú lateral.
3. Optimización se renombra contextualmente a **"Planificación operativa"** (copy; ruta `/optimization` se mantiene).
4. Optimización incluye orientación cruzada hacia Simulación.
5. No se fusionan ambos módulos en una sola pantalla (se descarta Opción B).
6. Las variables UI deben ser honestas: conectadas al motor, derivadas con explicación, o etiquetadas como pendientes (ver matriz de variables).

## Alternativas consideradas

### Opción B — Fusionar Optimización dentro de Simulación

- **Pros:** Un solo punto de entrada, menos confusión superficial.
- **Contras:** Pantalla sobrecargada; mezcla evaluación de tesis con operación diaria; mayor refactor de frontend.
- **Descartada** porque aumenta complejidad de UI sin beneficio claro para la defensa.

### Mantener estado actual (sin cambios)

- **Pros:** Cero esfuerzo.
- **Contras:** Confusión persistente; demo de defensa requiere explicación ad hoc; CTAs compiten.
- **Descartada.**

## Consecuencias

### Positivas

- Flujo de defensa claro y reproducible.
- Separación semántica alineada con el capítulo de tesis (evaluación vs operación).
- Menor refactor que fusión total; cambios incrementales por fases.
- La matriz de variables permite priorizar qué conectar en Fase 3.

### Negativas / trade-offs

- Siguen existiendo dos pantallas (mitigado con copy y jerarquía de navegación).
- Duplicación parcial de resultados/historial hasta Fase 4–5.
- Requiere actualizar documentación, Dashboard, menú y textos en varias fases.

### Neutras

- El backend no cambia en esta ADR; solo la jerarquía UX y la documentación.
- La ruta `/optimization` se conserva por compatibilidad con enlaces existentes.

## Implementación por fases

| Fase | Entregable relacionado con esta ADR |
|------|-------------------------------------|
| 1 | Menú reordenado, CTA Dashboard, copy de orientación |
| 2 | Wizard Simulación como flujo canónico |
| 3 | Honestidad de variables UI |
| 4 | Acciones post-simulación hacia Analítica/Reportes |
| 5 | Delimitación final y reducción de solapamiento |
| 6 | Validación con checklist de aceptación, guion demo y manual |

## Referencias

- [ux-flujo-simulacion.md](./ux-flujo-simulacion.md)
- [matriz-variables-motor.md](./matriz-variables-motor.md)
- [checklist-aceptacion-defensa.md](./checklist-aceptacion-defensa.md)
- Código: `src/core/auth/permissions.ts`, `src/features/simulation/`, `src/features/optimization/`
- API: `POST /api/v1/simulations/optimize`
