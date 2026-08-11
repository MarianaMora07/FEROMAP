# Fase 2 — Wizard guiado de Simulación

**Estado:** completado  
**Fecha:** 2026-08-08

## Entregables

- [x] Wizard secuencial de 3 pasos con navegación anterior/siguiente
- [x] CTAs: Continuar → Ejecutar simulación → acciones de seguimiento
- [x] Panel «Qué estás configurando» con escenario derivado en tiempo real
- [x] Validaciones previas (vehículos asignables, puntos activos)
- [x] Progreso y logs del motor durante ejecución
- [x] Resumen ejecutivo en resultados (ahorro %, distancia, cobertura, CO₂)
- [x] Estados loading / error / empty

## Archivos nuevos

| Archivo | Rol |
|---------|-----|
| `src/core/utils/simulationWizard.ts` | Mapeo de condiciones, readiness, resumen ejecutivo |
| `src/features/simulation/WizardStepNav.tsx` | Barra de pasos |
| `src/features/simulation/ConfigurationSummaryPanel.tsx` | Panel lateral explicativo |
| `src/features/simulation/ExecutionPanel.tsx` | Progreso y logs |
| `src/features/simulation/ExecutiveSummary.tsx` | KPIs destacados en paso 3 |

## Flujo

1. **Configuración** — escenario, condiciones, escenarios rápidos, mapa preview
2. **Revisión y ejecución** — recap, validación, ejecutar con logs en vivo
3. **Resultados e impacto** — resumen ejecutivo, tabla comparativa, mapa, acciones

## Verificación manual

1. Ir a `/simulation`
2. Configurar condiciones → **Continuar**
3. Revisar panel → **Ejecutar simulación**
4. Ver resumen ejecutivo y KPIs sin salir de la página
5. Probar **Nueva simulación** para reiniciar el wizard
