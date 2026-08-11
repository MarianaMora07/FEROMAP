# Fase 3 — Honestidad funcional de variables

**Estado:** completado  
**Fecha:** 2026-08-08

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

Ver [matriz-variables-motor.md](../fase-0/matriz-variables-motor.md) (sección Fase 3 al final del archivo).

## Archivos clave

- `backend/app/services/scenario_parameters.py` — lógica de modificadores
- `backend/app/schemas/simulation.py` — contrato `OptimizeRequest`
- `backend/tests/test_scenario_parameters.py` — tests de contrato
- `src/core/utils/simulationWizard.ts` — payload UI → API
- `src/features/optimization/index.tsx` — UI operativa honesta

## Tests

```bash
just test
# o: cd backend && python -m pytest tests/test_scenario_parameters.py -v
```
