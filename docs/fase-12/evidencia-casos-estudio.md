# Evidencia casos de estudio — Fase 12.7 (defensa)

> Generado automáticamente: **2026-09-01 14:00 UTC**  
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

## 2. Tabla comparativa (3 casos demo)

| Caso           | Escenario | Puntos | Cubiertos | Dist. ACO (km) | Duración (h) | Rutas | Simulación |
|----------------|-----------|--------|-----------|----------------|--------------|-------|------------|
| CE-UNARE-NORTE | normal    | 15     | 15        | 27.1           | 6.04         | 1     | 102        |
| CE-UNARE-SUR   | normal    | 15     | 15        | 29.2           | 6.17         | 1     | 103        |
| CE-MULTI-VIAJE | saturated | 12     | 12        | 45.2           | 6.01         | 1     | 104        |

## 3. Mismo punto, dos casos, dos rutas

Contenedor compartido **`CNT-006`** (M:N entre CE-UNARE-NORTE y CE-UNARE-SUR).

- **Coordenadas catálogo:** (8.27574, -62.75866) — inmutables entre casos
- **Llenado catálogo:** 456 kg / 1200 kg

| Caso           | Demanda CNT-006 (kg) | Ruta asignada          | Orden parada |
|----------------|----------------------|------------------------|--------------|
| CE-UNARE-NORTE | 400                  | TR-01 / Maickol Mendez | 8            |
| CE-UNARE-SUR   | 900                  | TR-01 / Maickol Mendez | 12           |

**Lectura para la defensa:**

- ✅ Demanda distinta en `CNT-006`: Norte 400 kg vs Sur 900 kg (overrides por caso, catálogo intacto).
- ✅ Rutas distintas: el ACO reoptimiza con instancias VRP separadas por caso (distancia Norte 27.1 km vs Sur 29.2 km).

## 4. Reporte individual por caso

```bash
just case-study-report CE-UNARE-NORTE
just case-study-report CE-UNARE-SUR
just case-study-report CE-MULTI-VIAJE
```

## 5. Guion oral (3 min)

Ver [guion-defensa-casos-estudio.md](./guion-defensa-casos-estudio.md).
