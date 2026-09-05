# Evidencia académica — demo de defensa (Fase B5)

> **Generado:** 2026-09-04 15:21 UTC  
> **Regenerar:** `just phase-b-evidence` (incluye reportes individuales + tabla comparativa)

**Objetivo (D20–D21):** anexo reproducible con cuatro casos de estudio aislados. Los tres primeros sustentan la narrativa oral; **CE-COMBINATORIO** documenta escala combinatoria sin mostrarse en la demo en vivo (D8).

## 1. Tabla comparativa (4 casos)

| Caso            | Uso en defensa                                     | Escenario | Puntos | Cubiertos | Pend. | km ACO | Max h/ruta | Rutas | Sim. |
|-----------------|----------------------------------------------------|-----------|--------|-----------|-------|--------|------------|-------|------|
| CE-UNARE-NORTE  | Demo acotada / ensayo rápido                       | normal    | 15     | 15        | 0     | 116.7  | 11.17      | 7     | 65   |
| CE-UNARE-SUR    | Evidencia comparativa (aislamiento M:N)            | normal    | 15     | 15        | 0     | 128.1  | 11.63      | 7     | 66   |
| CE-MULTI-VIAJE  | Multi-viaje al vertedero                           | saturated | 12     | 12        | 0     | 127.0  | 10.45      | 7     | 67   |
| CE-COMBINATORIO | Stress test — **solo anexo** (D8, no demo en vivo) | saturated | 120    | 107       | 13    | 612.8  | 4.65       | 35    | 72   |

### Lectura para la tesis

| Caso | Qué demuestra |
|------|---------------|
| CE-UNARE-NORTE | Subconjunto compacto (15 pts) — baseline vs ACO en escenario `normal`. |
| CE-UNARE-SUR | Mismo catálogo físico, demandas distintas (M:N con Norte vía `CNT-006`). |
| CE-MULTI-VIAJE | Restricción de capacidad y visitas al vertedero (`saturated`). |
| CE-COMBINATORIO | **Stress test** (~120 pts, 5 días simulados): dificultad combinatoria; `demoVisible: false` en UI; citar solo en anexo / Cap. resultados. |

> **D8:** no abrir CE-COMBINATORIO durante el guion de 10 min. Ver [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md).

## 2. Reportes individuales (regenerables)

```bash
just case-study-report CE-UNARE-NORTE
just case-study-report CE-UNARE-SUR
just case-study-report CE-MULTI-VIAJE
just case-study-report CE-COMBINATORIO
```

| Caso | Archivo | Generado |
|------|---------|----------|
| CE-UNARE-NORTE | [reportes/CE-UNARE-NORTE.md](./reportes/CE-UNARE-NORTE.md) | 2026-09-04 15:14 UTC |
| CE-UNARE-SUR | [reportes/CE-UNARE-SUR.md](./reportes/CE-UNARE-SUR.md) | 2026-09-04 15:15 UTC |
| CE-MULTI-VIAJE | [reportes/CE-MULTI-VIAJE.md](./reportes/CE-MULTI-VIAJE.md) | 2026-09-04 15:15 UTC |
| CE-COMBINATORIO | [reportes/CE-COMBINATORIO.md](./reportes/CE-COMBINATORIO.md) | 2026-09-04 15:21 UTC |

**CE-COMBINATORIO** usa modo planificación semanal (120 puntos activos, umbral > 25). Métricas: 107 visitas en la semana simulada, 13 pendiente(s) al cierre, 612.8 km ACO acumulados.

## 3. Aislamiento entre casos (pytest)

```bash
just test-case-study-isolation
```

Detalle ampliado: [evidencia-casos-estudio.md](../fase-12/evidencia-casos-estudio.md) (sección CNT-006 Norte vs Sur).

## 4. Capturas opcionales (anexo visual)

Si se incluyen en la tesis, guardar en `docs/fase-b/capturas/` con el prefijo del caso:

| Archivo sugerido | Contenido |
|------------------|-----------|
| `capturas/CE-UNARE-NORTE-kpis.png` | Paso 3 simulación — KPIs baseline vs ACO |
| `capturas/CE-MULTI-VIAJE-rutas.png` | Mapa multi-viaje al vertedero |
| `capturas/CE-COMBINATORIO-semanal.png` | Tabla semanal del reporte planificación |

_Las capturas no se generan automáticamente; son opcionales para el PDF de anexo._

## 5. Referencias

- [alcance-demo-defensa.md](./alcance-demo-defensa.md) — §8 casos de estudio
- [guion-demo-defensa-10min.md](./guion-demo-defensa-10min.md) — demo en vivo
- [guion-defensa-casos-estudio.md](../fase-12/guion-defensa-casos-estudio.md) — guion oral 3 min
- `data/seeds/case_studies.json` — definición de casos
