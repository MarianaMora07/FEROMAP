# Fase 3 — Honestidad funcional de variables (2026-08-08)

Ver [README-rigor.md](./README-rigor.md) para la Fase 3 de rigor algorítmico (2026-08-27).

## Decisiones por variable

| Variable | Acción | Detalle |
|----------|--------|---------|
| Toggles de condiciones | **Conectada** | → `scenarioId` vía `deriveScenarioId()` |
| Intensidad de lluvia | **Conectada** | API `rainIntensity`; escala tiempos si `scenarioId=rain` |
| Nivel de desechos (%) | **Conectada** | API `wasteLevelPct`; suma a `fillLevelBoost` si `scenarioId=saturated` |
| Duración estimada | **Informativa** | API `estimatedDurationHours`; se persiste, no afecta VRP |
| Algoritmo (Optimización UI) | **Etiquetado** | Solo ACO; selector GA/SA eliminado |
| Objetivo (Optimización UI) | **Próximamente** | Bloque informativo |
| Fecha operación | **Informativa** | Solo `localStorage` |
| Restricciones `avoid_traffic` / `critical_first` | **Conectada** | Inferencia de escenario en módulo operativo |
| Restricciones `fill_level` / `time_window` | **Próximamente** | Deshabilitadas en UI |

## Matriz actualizada

Ver [matriz-variables-motor.md](../fase-0/matriz-variables-motor.md).
