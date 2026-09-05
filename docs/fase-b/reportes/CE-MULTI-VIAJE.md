# Reporte caso de estudio — CE-MULTI-VIAJE

**Nombre:** Multi-viaje — demanda alta  
**Escenario:** saturated  
**Puntos activos:** 12  
**Simulación:** 59  
**Modo:** optimización de un solo día (≤ 25 pts activos)  

## Resumen optimización

| Métrica                      | Valor                     |
|------------------------------|---------------------------|
| Escenario                    | saturated                 |
| Simulación                   | 59                        |
| Puntos del día               | 12/12 cubiertos           |
| Sin cubrir                   | 0                         |
| Distancia baseline           | 98.3 km                   |
| Distancia ACO                | 127.0 km                  |
| Ahorro distancia             | -29.2%                    |
| Duración max ruta            | 1.79 h                    |
| Duración suma flota          | 10.45 h                   |
| Jornada referencia           | 12 h                      |
| Excede jornada (alguna ruta) | no                        |
| CO₂ evitado                  | 0.0 kg                    |
| Convergencia ACO             | 26.4 → 17.132 km (+35.1%) |
| Iteraciones ACO              | 6                         |
| Parada temprana              | sí                        |
| KPIs plausibles (día)        | sí                        |

## Plan del día por conductor

| Ruta | Vehículo | Conductor    | Paradas | Vert. | km   | h    | Estado  | Secuencia (muestra)             |
|------|----------|--------------|---------|-------|------|------|---------|---------------------------------|
| 242  | TR-01    | Juan Pérez   | 2       | 1     | 26.4 | 1.79 | pending | CNT-017, CNT-009, VERT          |
| 243  | TR-03    | Carlos Rivas | 3       | 1     | 13.4 | 1.75 | pending | CNT-003, CNT-001, CNT-002, VERT |
| 244  | TR-11    | Ana Pérez    | 2       | 1     | 14.2 | 1.45 | pending | CNT-007, CNT-020, VERT          |
| 245  | TR-04    | Luis Méndez  | 1       | 1     | 19.3 | 1.32 | pending | CNT-014, VERT                   |
| 246  | TR-02    | María Gómez  | 1       | 1     | 21.6 | 1.42 | pending | CNT-016, VERT                   |
| 247  | TR-06    | Sofía Díaz   | 2       | 1     | 14.9 | 1.48 | pending | CNT-005, CNT-004, VERT          |
| 248  | TR-12    | Diego Torres | 1       | 1     | 17.1 | 1.24 | pending | CNT-011, VERT                   |

## Convergencia ACO (últimas iteraciones)

| Iter | Mejor km | Iter km |
|------|----------|---------|
| 5    | 14.879   | 14.879  |
| 6    | 14.879   | 14.879  |
| 1    | 17.132   | 17.132  |
| 2    | 17.132   | 17.132  |
| 3    | 17.132   | 17.132  |
| 4    | 17.132   | 17.132  |
| 5    | 17.132   | 17.132  |
| 6    | 17.132   | 17.132  |

## Metadatos del caso (motor)

```json
{
  "caseStudyId": 31,
  "caseStudyCode": "CE-MULTI-VIAJE",
  "servedPointCodes": [
    "CNT-001",
    "CNT-002",
    "CNT-003",
    "CNT-004",
    "CNT-005",
    "CNT-007",
    "CNT-009",
    "CNT-011",
    "CNT-014",
    "CNT-016",
    "CNT-017",
    "CNT-020"
  ],
  "acoAnts": 16,
  "acoIterations": 25
}
```

_Generado 2026-09-04 15:15 UTC_