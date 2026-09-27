# ADR-004: Vertedero obligatorio y jornada operativa (multi-viaje CVRP)

| Campo | Valor |
|-------|-------|
| **Estado** | Aceptado (Fase 0 — contrato) |
| **Fecha** | 2026-08-15 |
| **Fase** | 9 — Realismo operativo (descarga en vertedero + límite de jornada) |
| **Implementación motor** | Fases 1–2 |
| **Contrato código** | `backend/app/domain/landfill_service_time.py`, `src/core/types/landfillServiceTime.ts` |

## Contexto

Hoy el VRP/ACO modela:

- **Demanda** por contenedor (kg / nivel de llenado)
- **Capacidad** por vehículo (kg)
- **Un solo viaje** por camión: al llenarse, la ruta termina y vuelve al depósito
- **Depósito** (`-62.715, 8.295`) como inicio y fin, sin nodo de vertedero

En la operación real:

- Al **llenar la capacidad**, el camión **debe ir al vertedero** a descargar antes de seguir recolectando.
- La jornada municipal es **06:00 – 18:00** (12 h); si no hay tiempo, la ruta se cierra y quedan contenedores pendientes.

Para la defensa hace falta explicar por qué el ACO sigue optimizando **distancia**, pero los KPIs reflejan **descargas en vertedero** y el **corte por jornada de 12 h**.

## Decisiones cerradas

### 1. Separar depósito y vertedero

| Instalación | Rol | Coordenadas (demo) |
|-------------|-----|-------------------|
| **Depósito (base)** | Salida y cierre de jornada | `-62.715, 8.295` (Parroquia Unare) |
| **Vertedero** | Descarga obligatoria al llenar capacidad | `-62.690, 8.280` (placeholder editable) |

El vertedero se configura en `OperationalSettings` (`landfillLat`, `landfillLon`, `landfillUnloadMinutes`). Las coordenadas demo se reemplazan por las reales cuando lleguen de la entrevista de campo (preguntas C9/F5).

### 2. Representación en el motor

Índices de nodos en la matriz de distancias:

| Índice | Nodo |
|--------|------|
| `0` | Depósito (base) |
| `1 … N` | Contenedores |
| `N + 1` | Vertedero (`LANDFILL_IDX`) |

Ejemplo de ruta resultante:

```
[0, 3, 7, 12, 21, 5, 9, 21, 0]
 ↑──────────────↑   ↑───────↑  ↑
  recolecta      vertedero  recolecta + cierra en base
```

- `21` = `LANDFILL_IDX` cuando `N = 20` contenedores.
- La ruta **siempre** cierra en depósito (`0`).
- Si el camión va cargado al final del turno, pasa por vertedero antes de cerrar.

### 3. Regla de capacidad

```
Si load + demanda(contenedor) > capacidad_vehículo:
  → insertar parada vertedero (LANDFILL_IDX)
  → load = 0
  → continuar con el mismo vehículo
```

El fitness del ACO **no** cambia: sigue siendo distancia recorrida. La inserción del vertedero es consecuencia de la restricción de capacidad, no un objetivo adicional.

### 4. Tiempo en vertedero

| Constante | Valor default |
|-----------|---------------|
| `DEFAULT_LANDFILL_UNLOAD_MINUTES` | 15 |
| `DEFAULT_LANDFILL_UNLOAD_SECONDS` | 900 |

```
landfillUnloadSec = landfillUnloadMinutes × 60
```

- Se suma a **KPIs de duración** y `estimatedDurationSeconds`.
- **No** entra en el fitness del ACO (misma separación que ADR-003: dotación vs distancia).

### 5. Límite de jornada (06:00 – 18:00)

| Campo | Default | Rol |
|-------|---------|-----|
| `workStart` | `"06:00"` | Inicio de jornada operativa |
| `workEnd` | `"18:00"` | Fin de jornada operativa |

```
shiftBudgetSec = secondsBetween(workStart, workEnd)   // 06:00→18:00 = 43 200 s
```

**Regla de corte** — antes de agregar una parada candidata:

```
if elapsedSec + travelTo(candidate) + serviceAt(candidate) > shiftBudgetSec:
  → cerrar ruta (ir a vertedero si load > 0, luego depósito)
  → contenedores no visitados quedan pendientes (uncovered)
```

La jornada limita la **capa operativa** (qué paradas caben), no el objetivo de distancia del ACO.

### 6. Objetivo del ACO vs reporte operativo

| Capa | Qué minimiza / reporta |
|------|-------------------------|
| **ACO + 2-opt** | **Distancia recorrida** (metros en red vial). Sin tiempo de servicio, sin descarga en vertedero. |
| **KPIs y rutas persistidas** | **Tiempo operativo** = viaje + paradas (ADR-003) + descargas en vertedero, sujeto a `shiftBudgetSec`. |

**Consecuencia:** dos corridas con la **misma secuencia en km** pueden tener **distinta duración** si cambia `landfillUnloadMinutes` o la dotación — y pueden dejar **contenedores sin cubrir** si la jornada de 12 h no alcanza.

## Fórmulas

### Tiempo operativo acumulado por ruta

```
elapsedSec = travelSec
           + (n_collection_stops × serviceTimeSec)
           + (n_landfill_visits × landfillUnloadSec)
```

Donde `serviceTimeSec` proviene de ADR-003 (`crew_service_time`).

### Presupuesto de jornada

```
shiftBudgetSec = secondsBetween(workStart, workEnd)
```

Default: `06:00` → `18:00` = **12 h** = **43 200 s**.

### Utilización de jornada (KPI)

```
shiftUtilizationPct = min(100, elapsedSec / shiftBudgetSec × 100)
```

### Parada asequible dentro de jornada

```
canFit = elapsedSec + travelToSec + serviceAtSec ≤ shiftBudgetSec
```

## Ejemplos numéricos

Supuesto: ruta con **5 paradas de recolección**, **2 viajes al vertedero**, viaje = 2 h, dotación completa (300 s/punto), descarga = 15 min.

| Componente | Cálculo | Total |
|------------|---------|-------|
| Viaje | 2 h | 7 200 s |
| Paradas | 5 × 300 s | 1 500 s |
| Vertedero | 2 × 900 s | 1 800 s |
| **Total** | | **10 500 s ≈ 2,9 h** |

Jornada disponible: 43 200 s (12 h) → `shiftUtilizationPct ≈ 24 %`.

Si la demanda requiere 14 h de operación, la ruta se corta al superar `shiftBudgetSec`; los contenedores restantes aparecen en `uncoveredPointCodes`.

## Matriz objetivo vs reporte

| Artefacto | Distancia | Viaje | Paradas | Vertedero | Jornada | ¿Usa dotación? |
|-----------|-----------|-------|---------|-----------|---------|----------------|
| Fitness ACO / 2-opt | ✅ minimiza | indirecto | ❌ | ❌ | ❌ | ❌ |
| `_compute_kpis.durationHours` | — | ✅ | ✅ (ADR-003) | ✅ (Fase 2) | ✅ (Fase 2) | ✅ |
| `optimized_routes.estimated_duration_seconds` | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| GeoJSON / mapa | ✅ | ✅ | ✅ | badge vertedero | — | ✅ |

## Contrato API (Fase 0)

### Configuración operativa — `GET/PATCH /admin/settings`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `depotLat` | float | `-62.715` | Latitud depósito (base) |
| `depotLon` | float | `8.295` | Longitud depósito |
| `landfillLat` | float | `-62.690` | Latitud vertedero (placeholder) |
| `landfillLon` | float | `8.280` | Longitud vertedero |
| `landfillUnloadMinutes` | int | `15` | Tiempo de descarga por visita |
| `workStart` | string | `"06:00"` | Inicio jornada (`HH:MM`) |
| `workEnd` | string | `"18:00"` | Fin jornada (`HH:MM`) |

> **Fase 1:** persistencia en `OperationalSettings` y UI admin.  
> **Fase 0:** contrato y funciones puras en dominio.

### Respuesta KPI (Fase 2)

```json
{
  "durationHours": { "current": 5.1, "optimized": 3.8 },
  "durationBreakdown": {
    "optimized": {
      "travelHours": 2.4,
      "serviceHours": 0.7,
      "unloadHours": 0.5,
      "landfillTrips": 2,
      "shiftBudgetHours": 12.0,
      "shiftUsedHours": 3.6,
      "shiftUtilizationPct": 30,
      "uncoveredPoints": 3,
      "crewLabel": "6/6 (conductor + 5 operarios)"
    }
  }
}
```

### Waypoints persistidos (Fase 1)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `waypointType` | `"collection"` \| `"landfill"` | Tipo de parada |
| `facilityCode` | `"landfill"` \| null | Código de instalación especial |
| `collectionPointId` | int \| null | Nullable para paradas de vertedero |

## Consecuencias por fase

| Fase | Alcance |
|------|---------|
| **0** | ADR + contrato API/tipos + dominio puro |
| **1** | Migración `route_waypoints`, settings admin, coordenadas placeholder |
| **2** | Motor multi-viaje + corte por jornada en ACO |
| **3** | Persistencia, GeoJSON, playback, KPIs |
| **4** | UI simulación, mapa, alertas de puntos no cubiertos |
| **5** | Tests de aceptación |

## Fuera de alcance (fases futuras)

- Cola de espera en vertedero (tiempo variable)
- Múltiples vertederos
- Horario de apertura/cierre del vertedero
- Re-optimización intradía al cortar jornada

## Criterio de aceptación Fase 0

Un evaluador lee este ADR y entiende:

1. Por qué el ACO optimiza **distancia** y no incluye descargas ni jornada en su fitness.
2. Por qué los KPIs **sí** incluyen viajes al vertedero y el límite de **12 h** (06:00–18:00).
3. Qué campos API y funciones de dominio usarán las fases siguientes.

## Referencias

- [README Fase 9](./README.md)
- [ADR-003 Dotación y tiempo de servicio](../fase-8/adr-dotacion-tiempo-servicio.md)
- `backend/app/services/graph_service.py` — depósito actual
- Guía entrevista — preguntas C9, F5 (`docs/anexo-guia-entrevista-capitulo-4.md`)
