# Fase 5 — Delimitación final Simulación vs Optimización (Opción A)

**Estado:** completado  
**Fecha:** 2026-08-08

## Entregables

| Entregable | Ubicación |
|------------|-----------|
| Matriz de responsabilidades (1 página) | [matriz-responsabilidades-modulos.md](./matriz-responsabilidades-modulos.md) |
| Copy de orientación cruzada | `ModuleGuidanceBanner` en `/simulation` y `/optimization` |
| Formularios sin duplicación innecesaria | Eliminada pestaña Escenarios y comparación KPI en Optimización; despacho solo en Optimización |
| Reglas de navegación | [reglas-navegacion.md](./reglas-navegacion.md) |
| Consistencia stores/API | `operationalHistory.ts` separa historial operativo del de tesis |

## Cambios de UI

### Simulación
- Banner: «¿Quieres despachar rutas de hoy?» → Planificación operativa
- Post-resultado: enlace a despacho en Optimización (sin botón de despacho directo)

### Planificación operativa
- Banner: «¿Quieres evaluar escenarios?» → Simulación de escenarios
- Pestaña «Escenarios guardados» eliminada
- Tabla comparativa KPI (tesis) eliminada; se mantienen tarjetas de ruta + despacho
- Historial operativo filtrado (solo corridas desde este módulo)
- Copy: «Ejecutando optimización» (no «simulación»)

## Criterio de cierre

Queda claro cuándo usar Simulación (evaluar escenarios / defensa) y cuándo Optimización (operación diaria / despacho), sin ambigüedad.

## Verificación manual

1. Ejecutar desde Simulación → aparece en Historial de Simulación, no en historial operativo.
2. Ejecutar desde Optimización → aparece en historial operativo; enlace a Simulación para escenarios de tesis.
3. Banners cruzados visibles en ambas pantallas.
4. Despachar solo disponible en Optimización tras generar ruta.
