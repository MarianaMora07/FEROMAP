# Reporte caso de estudio — CE-UNARE-NORTE

**Nombre:** Unare Norte — subconjunto compacto  
**Escenario:** normal  
**Puntos activos:** 15  
**Simulación:** 57  
**Modo:** optimización de un solo día (≤ 25 pts activos)  

## Resumen optimización

| Métrica                      | Valor                       |
|------------------------------|-----------------------------|
| Escenario                    | normal                      |
| Simulación                   | 57                          |
| Puntos del día               | 15/15 cubiertos             |
| Sin cubrir                   | 0                           |
| Distancia baseline           | 88.0 km                     |
| Distancia ACO                | 116.7 km                    |
| Ahorro distancia             | -32.6%                      |
| Duración max ruta            | 1.81 h                      |
| Duración suma flota          | 11.17 h                     |
| Jornada referencia           | 12 h                        |
| Excede jornada (alguna ruta) | no                          |
| CO₂ evitado                  | 0.0 kg                      |
| Convergencia ACO             | 13.448 → 15.832 km (-17.7%) |
| Iteraciones ACO              | 6                           |
| Parada temprana              | sí                          |
| KPIs plausibles (día)        | sí                          |

## Plan del día por conductor

| Ruta | Vehículo | Conductor    | Paradas | Vert. | km   | h    | Estado  | Secuencia (muestra)             |
|------|----------|--------------|---------|-------|------|------|---------|---------------------------------|
| 214  | TR-01    | Juan Pérez   | 3       | 1     | 13.4 | 1.75 | pending | CNT-003, CNT-001, CNT-002, VERT |
| 215  | TR-03    | Carlos Rivas | 2       | 1     | 14.2 | 1.45 | pending | CNT-008, CNT-007, VERT          |
| 216  | TR-11    | Ana Pérez    | 2       | 1     | 19.5 | 1.66 | pending | CNT-013, CNT-014, VERT          |
| 217  | TR-04    | Luis Méndez  | 1       | 1     | 21.7 | 1.42 | pending | CNT-015, VERT                   |
| 218  | TR-02    | María Gómez  | 3       | 1     | 14.9 | 1.81 | pending | CNT-005, CNT-004, CNT-006, VERT |
| 219  | TR-06    | Sofía Díaz   | 2       | 1     | 17.2 | 1.57 | pending | CNT-012, CNT-011, VERT          |
| 220  | TR-12    | Diego Torres | 2       | 1     | 15.8 | 1.51 | pending | CNT-010, CNT-009, VERT          |

## Convergencia ACO (últimas iteraciones)

| Iter | Mejor km | Iter km |
|------|----------|---------|
| 5    | 17.161   | 17.161  |
| 6    | 17.161   | 17.161  |
| 1    | 15.832   | 15.832  |
| 2    | 15.832   | 15.832  |
| 3    | 15.832   | 15.832  |
| 4    | 15.832   | 15.832  |
| 5    | 15.832   | 15.832  |
| 6    | 15.832   | 15.832  |

## Metadatos del caso (motor)

```json
{
  "caseStudyId": 29,
  "caseStudyCode": "CE-UNARE-NORTE",
  "servedPointCodes": [
    "CNT-001",
    "CNT-002",
    "CNT-003",
    "CNT-004",
    "CNT-005",
    "CNT-006",
    "CNT-007",
    "CNT-008",
    "CNT-009",
    "CNT-010",
    "CNT-011",
    "CNT-012",
    "CNT-013",
    "CNT-014",
    "CNT-015"
  ],
  "acoAnts": 12,
  "acoIterations": 20
}
```

_Generado 2026-09-04 15:14 UTC_