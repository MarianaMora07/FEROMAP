# Reporte caso de estudio — CE-COMBINATORIO (modo planificación)

**Nombre:** Infierno combinatorio — catálogo completo Unare  
**Escenario:** saturated  
**Puntos activos en el caso:** 120  
**Jornada de referencia:** 12 h por ruta  

Simulación **como en planificación operativa**: los puntos se reparten en **5 días laborables**, cada día se optimiza con el subconjunto del día + **pendientes** heredados del día anterior. Lo no cubierto pasa al día siguiente (equivalente a `defer_uncovered` / visitas pendientes).

## Calendario semanal simulado

| Día       | Fecha      | Prog. | Pend. hered. | Cubiertos | Sin cubrir | → Siguiente | km ACO | Max h/ruta | Rutas |
|-----------|------------|-------|--------------|-----------|------------|-------------|--------|------------|-------|
| Lunes     | 2030-03-04 | 24    | 0            | 14        | 10         | 10          | 94.4   | 3.21       | 7     |
| Martes    | 2030-03-05 | 24    | 10           | 22        | 12         | 12          | 120.6  | 3.33       | 7     |
| Miércoles | 2030-03-06 | 24    | 12           | 28        | 8          | 8           | 139.8  | 4.65       | 7     |
| Jueves    | 2030-03-07 | 24    | 8            | 20        | 12         | 12          | 120.7  | 2.88       | 7     |
| Viernes   | 2030-03-08 | 24    | 12           | 23        | 13         | 13          | 137.3  | 3.28       | 7     |

## Lectura operativa

- **Cobertura en la semana:** 107 visitas ejecutadas en total (puede haber reprogramaciones).
- **Pendientes al cierre del viernes:** 13 punto(s). (CNT-009, CNT-010, CNT-024, CNT-031, CNT-039, CNT-046, CNT-054, CNT-061…)
- **Duración por ruta:** cada fila «Max h/ruta» es el turno de un conductor; debe estar ≤ 12 h. La suma de turnos **no** es una jornada única.

⚠️ Quedan **13 puntos** para la semana siguiente o para ampliar flota / replanificar.

## Detalle último día optimizado

## Resumen optimización

| Métrica                      | Valor                       |
|------------------------------|-----------------------------|
| Escenario                    | saturated                   |
| Simulación                   | 64                          |
| Puntos del día               | 23/36 cubiertos             |
| Sin cubrir                   | 13                          |
| Distancia baseline           | 133.2 km                    |
| Distancia ACO                | 137.3 km                    |
| Ahorro distancia             | -3.1%                       |
| Duración max ruta            | 3.28 h                      |
| Duración suma flota          | 15.43 h                     |
| Jornada referencia           | 12 h                        |
| Excede jornada (alguna ruta) | no                          |
| CO₂ evitado                  | 0.0 kg                      |
| Convergencia ACO             | 22.624 → 14.849 km (+34.4%) |
| Iteraciones ACO              | 7                           |
| Parada temprana              | sí                          |
| KPIs plausibles (día)        | sí                          |

## Plan del día por conductor

| Ruta | Vehículo | Conductor    | Paradas | Vert. | km   | h    | Estado  | Secuencia (muestra)                 |
|------|----------|--------------|---------|-------|------|------|---------|-------------------------------------|
| 312  | TR-01    | Juan Pérez   | 6       | 1     | 22.6 | 3.28 | pending | CNT-040, CNT-055, CNT-104, CNT-070… |
| 313  | TR-03    | Carlos Rivas | 5       | 1     | 21.1 | 2.89 | pending | CNT-080, CNT-065, CNT-115, CNT-035… |
| 314  | TR-11    | Ana Pérez    | 5       | 1     | 21.1 | 2.90 | pending | CNT-120, CNT-030, CNT-075, CNT-045… |
| 315  | TR-04    | Luis Méndez  | 1       | 1     | 16.2 | 1.25 | pending | CNT-095, VERT                       |
| 316  | TR-02    | María Gómez  | 2       | 1     | 23.1 | 1.86 | pending | CNT-090, CNT-015, VERT              |
| 317  | TR-06    | Sofía Díaz   | 2       | 1     | 18.3 | 1.68 | pending | CNT-105, CNT-110, VERT              |
| 318  | TR-12    | Diego Torres | 2       | 1     | 14.8 | 1.57 | pending | CNT-005, CNT-020, VERT              |

## Convergencia ACO (últimas iteraciones)

| Iter | Mejor km | Iter km |
|------|----------|---------|
| 5    | 18.279   | 18.279  |
| 6    | 18.279   | 18.279  |
| 1    | 14.849   | 14.849  |
| 2    | 14.849   | 14.849  |
| 3    | 14.849   | 14.849  |
| 4    | 14.849   | 14.849  |
| 5    | 14.849   | 14.849  |
| 6    | 14.849   | 14.849  |

## Metadatos

```json
{
  "caseStudyCode": "CE-COMBINATORIO",
  "planningMode": true,
  "workdays": 5,
  "activePointCount": 120,
  "engineParameters": {
    "scenarioId": "saturated",
    "acoAnts": 20,
    "acoIterations": 40,
    "operatorsShortage": 1,
    "timeWindowEnabled": true,
    "priorityFillLevel": true
  },
  "weeklyTotals": {
    "visitsExecuted": 107,
    "remainingPending": 13
  }
}
```

_Regenerado 2026-09-04 15:21 UTC_
