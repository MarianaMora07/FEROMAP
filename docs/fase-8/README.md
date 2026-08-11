# Fase 8 — Tiempo de servicio por dotación de cuadrilla

**Estado:** Fase 0 completada (ADR + contrato)  
**Fecha inicio:** 2026-08-11

## Objetivo

Modelar el tiempo en cada punto de recolección según la cuadrilla del camión (conductor + operarios), sin cambiar el objetivo del ACO (distancia), pero reflejando duración realista en KPIs.

## Entregables Fase 0

| Entregable | Ubicación |
|------------|-----------|
| ADR (decisiones + fórmulas) | [adr-dotacion-tiempo-servicio.md](./adr-dotacion-tiempo-servicio.md) |
| Dominio Python | `backend/app/domain/crew_service_time.py` |
| Contrato TypeScript | `src/data/types/crewServiceTime.ts` |
| Schema simulación | `operatorsShortage` en `OptimizeRequest` |
| API.md | Sección dotación + simulación |

## Fases siguientes

| Fase | Alcance | Estado |
|------|---------|--------|
| **0** | ADR + contrato API/tipos | ✅ Completada |
| **1** | BD `assigned_operators_count`, default ideal=6, PATCH | ✅ Completada |
| **2** | KPIs y rutas: viaje + servicio; ACO sigue en distancia | ✅ Completada |
| **3** | UI simulación: ausentismo del turno | ✅ Completada |
| **4** | Desglose en paso 3 + guion defensa | ✅ Completada |
| **5** | Tests integración (matriz aceptación) | ✅ Completada |

## Verificación Fase 5 (matriz completa)

```bash
# Backend — aceptación Fase 8
cd backend && python -m pytest tests/test_fase8_acceptance.py tests/test_crew_service_time.py \
  tests/test_optimization_crew_kpis.py tests/test_scenario_crew_modifiers.py -v

# Frontend — contrato dotación + desglose UI
npm test -- src/data/types/crewServiceTime.test.ts src/core/utils/optimizationResults.test.ts
```

| Test | Archivo |
|------|---------|
| 6→300s, 5→330s, 1→450s | `test_fase8_acceptance.py`, `crewServiceTime.test.ts` |
| KPI: distancia igual, duración sube | `test_fase8_acceptance.py` |
| `operatorsShortage` global | `test_fase8_acceptance.py`, `test_scenario_crew_modifiers.py` |
| ACO: misma semilla → misma ruta | `test_fase8_acceptance.py` |

## Verificación Fase 0

```bash
cd backend && python -m pytest tests/test_crew_service_time.py -v
npm test -- src/data/types/crewServiceTime.test.ts
```
