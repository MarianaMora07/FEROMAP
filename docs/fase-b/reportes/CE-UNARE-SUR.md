# Reporte caso de estudio — CE-UNARE-SUR

**Nombre:** Unare Sur — subconjunto occidental  
**Escenario:** normal  
**Puntos activos:** 15  
**Simulación:** 58  
**Modo:** optimización de un solo día (≤ 25 pts activos)  

## Resumen optimización

| Métrica                      | Valor                       |
|------------------------------|-----------------------------|
| Escenario                    | normal                      |
| Simulación                   | 58                          |
| Puntos del día               | 15/15 cubiertos             |
| Sin cubrir                   | 0                           |
| Distancia baseline           | 99.2 km                     |
| Distancia ACO                | 128.1 km                    |
| Ahorro distancia             | -29.1%                      |
| Duración max ruta            | 2.21 h                      |
| Duración suma flota          | 11.63 h                     |
| Jornada referencia           | 12 h                        |
| Excede jornada (alguna ruta) | no                          |
| CO₂ evitado                  | 0.0 kg                      |
| Convergencia ACO             | 24.868 → 15.832 km (+36.3%) |
| Iteraciones ACO              | 6                           |
| Parada temprana              | sí                          |
| KPIs plausibles (día)        | sí                          |

## Plan del día por conductor

| Ruta | Vehículo | Conductor    | Paradas | Vert. | km   | h    | Estado  | Secuencia (muestra)             |
|------|----------|--------------|---------|-------|------|------|---------|---------------------------------|
| 228  | TR-01    | Juan Pérez   | 3       | 1     | 24.9 | 2.21 | pending | CNT-018, CNT-017, CNT-019, VERT |
| 229  | TR-03    | Carlos Rivas | 3       | 1     | 14.2 | 1.79 | pending | CNT-008, CNT-007, CNT-020, VERT |
| 230  | TR-11    | Ana Pérez    | 2       | 1     | 19.5 | 1.66 | pending | CNT-013, CNT-014, VERT          |
| 231  | TR-04    | Luis Méndez  | 2       | 1     | 21.8 | 1.75 | pending | CNT-016, CNT-015, VERT          |
| 232  | TR-02    | María Gómez  | 1       | 1     | 14.8 | 1.14 | pending | CNT-006, VERT                   |
| 233  | TR-06    | Sofía Díaz   | 2       | 1     | 17.2 | 1.57 | pending | CNT-012, CNT-011, VERT          |
| 234  | TR-12    | Diego Torres | 2       | 1     | 15.8 | 1.51 | pending | CNT-010, CNT-009, VERT          |

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
  "caseStudyId": 30,
  "caseStudyCode": "CE-UNARE-SUR",
  "servedPointCodes": [
    "CNT-006",
    "CNT-007",
    "CNT-008",
    "CNT-009",
    "CNT-010",
    "CNT-011",
    "CNT-012",
    "CNT-013",
    "CNT-014",
    "CNT-015",
    "CNT-016",
    "CNT-017",
    "CNT-018",
    "CNT-019",
    "CNT-020"
  ],
  "acoAnts": 12,
  "acoIterations": 20
}
```

_Generado 2026-09-04 15:15 UTC_