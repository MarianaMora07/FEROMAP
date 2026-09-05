# Evidencia casos de estudio — Fase 12.7 (defensa)

> Generado automáticamente: **2026-09-04 15:26 UTC**  
> Regenerar: `just phase12-evidence`

## Objetivo

Demostrar que los casos de estudio son **experimentos aislados**: mismo contenedor físico (`CNT-006`) puede participar en dos casos con **demandas distintas** y **rutas distintas**, sin mutar el catálogo global ni otros casos.

## 1. Aislamiento A vs B (pytest)

```bash
./scripts/compose.sh exec -T api pytest tests/test_case_study_isolation.py -v
```

| Test | Verifica |
|------|----------|
| `test_shared_point_has_distinct_demands_per_case_study` | CNT-006 demanda distinta Norte/Sur |
| `test_running_case_study_does_not_mutate_other_case_or_catalog` | Optimizar Norte no toca Sur ni catálogo |
| `test_driver_report_accepts_case_study_flag` | CLI `just case-study-report` |

## 2. Tabla comparativa (4 casos)

| Caso            | Escenario | Puntos | Cubiertos | Pend. | Dist. ACO (km) | Duración (h) | Rutas | Simulación |
|-----------------|-----------|--------|-----------|-------|----------------|--------------|-------|------------|
| CE-UNARE-NORTE  | normal    | 15     | 15        | 0     | 116.7          | 11.17        | 7     | 73         |
| CE-UNARE-SUR    | normal    | 15     | 15        | 0     | 128.1          | 11.63        | 7     | 74         |
| CE-MULTI-VIAJE  | saturated | 12     | 12        | 0     | 127.0          | 10.45        | 7     | 75         |
| CE-COMBINATORIO | saturated | 120    | 107       | 13    | 612.8          | 4.65         | 35    | 80         |

> **CE-COMBINATORIO:** métricas de simulación semanal (5 días); km = suma diaria; duración = máx. h/ruta. No se muestra en la demo en vivo (D8).

## 3. Mismo punto, dos casos, dos rutas

Contenedor compartido **`CNT-006`** (M:N entre CE-UNARE-NORTE y CE-UNARE-SUR).

- **Coordenadas catálogo:** (8.27574, -62.75866) — inmutables entre casos
- **Llenado catálogo:** 456 kg / 1200 kg

| Caso           | Demanda CNT-006 (kg) | Ruta asignada       | Orden parada |
|----------------|----------------------|---------------------|--------------|
| CE-UNARE-NORTE | 456                  | TR-02 / María Gómez | 3            |
| CE-UNARE-SUR   | 456                  | TR-02 / María Gómez | 1            |

**Lectura para la defensa:**

- ✅ Rutas distintas: el ACO reoptimiza con instancias VRP separadas por caso (distancia Norte 116.7 km vs Sur 128.1 km).

## 4. Reporte individual por caso

```bash
just case-study-report CE-UNARE-NORTE
just case-study-report CE-UNARE-SUR
just case-study-report CE-MULTI-VIAJE
just case-study-report CE-COMBINATORIO
just phase-b-evidence
```

## 5. Guion oral (3 min)

Ver [guion-defensa-casos-estudio.md](./guion-defensa-casos-estudio.md).
