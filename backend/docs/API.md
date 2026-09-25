# FEROMAP API — Contrato `/api/v1`

Documento de referencia para integración frontend ↔ backend.  
OpenAPI interactivo: `http://localhost:8000/docs` (con el API levantado).

## Convenciones

| Aspecto | Detalle |
|---------|---------|
| Base URL | `/api/v1` |
| Formato | JSON (`camelCase` en respuestas de dominio) |
| Auth | JWT en header `Authorization: Bearer <token>` o cookie `feromap_access_token` |
| GeoJSON | `FeatureCollection` estándar para sectores, contenedores y rutas |
| Errores | `{ "detail": "mensaje" }` con HTTP 4xx/5xx |

### Roles

| Rol | Valor `role` | Acceso típico |
|-----|--------------|---------------|
| Administrador | `administrador` | Todo |
| Planificador | `planificador` | Optimización, CRUD operativo |
| Conductor | `conductor` | Monitoreo, contingencias |
| Residente | `residente` | Vista residente, puntos de su sector |

---

## Salud

### `GET /health`

Sin autenticación.

```json
{
  "status": "ok",
  "service": "feromap-api",
  "env": "local"
}
```

---

## Autenticación — `/api/v1/auth`

### `POST /auth/login`

**Body**

```json
{
  "email": "plan@fero.com",
  "password": "123456789"
}
```

**Response `200`**

```json
{
  "accessToken": "eyJ...",
  "tokenType": "bearer",
  "user": {
    "id": 1,
    "email": "plan@fero.com",
    "firstName": "Ana",
    "lastName": "Planificadora",
    "role": "planificador",
    "sectorId": null,
    "sectorName": null,
    "driverId": null
  }
}
```

También establece cookie HTTP-only `feromap_access_token`.

### `GET /auth/me`

Requiere auth. Mismo objeto `user` que en login.

### `POST /auth/logout`

Elimina cookie. Response: `{ "ok": true }`.

---

## Perfil — `/api/v1/profile`

### `GET /profile/me`

```json
{
  "id": 1,
  "email": "plan@fero.com",
  "firstName": "Ana",
  "lastName": "Planificadora",
  "phone": "+58 414-000-0000",
  "role": "planificador",
  "roleLabel": "Planificador",
  "sectorId": null,
  "sectorName": null,
  "active": true,
  "lastLoginAt": "2026-06-25T12:00:00+00:00",
  "createdAt": "2026-01-01T00:00:00+00:00"
}
```

### `PATCH /profile/me`

**Body** (campos opcionales)

```json
{
  "firstName": "Ana",
  "lastName": "García",
  "phone": "+58 414-111-2222"
}
```

### `PATCH /profile/preferences`

```json
{
  "theme": "dark",
  "language": "es",
  "units": "metric",
  "defaultView": "dashboard",
  "reportFrequency": "daily",
  "pageSize": 20,
  "emailNotifications": true,
  "systemNotifications": true,
  "address": "Sector Unare I",
  "timezone": "America/Caracas"
}
```

### `POST /profile/change-password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

### `GET /profile/sessions`

Lista sesiones activas del usuario.

### `DELETE /profile/sessions/{id}`

Revoca una sesión. Si es la sesión actual, el cliente debe cerrar sesión.

### `POST /profile/avatar`

Sube imagen (`multipart/form-data`, campo `file`) o URL (`avatarUrl` en form).

### `GET /profile/avatar/file`

Sirve el avatar subido del usuario autenticado.

---

## Geo / catálogo GIS — `/api/v1`

### `GET /sectors`

GeoJSON de polígonos por sector.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "Unare I",
        "population": 4200,
        "avgWasteKg": 180
      },
      "geometry": { "type": "Polygon", "coordinates": [[...]] }
    }
  ]
}
```

### `GET /collection-points`

GeoJSON de puntos de recolección.

Query params: `sector`, `minFill`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "045",
        "sector": "Unare I",
        "fillLevel": 72,
        "priority": "alta",
        "lastCollection": "24/06/2026",
        "capacityKg": 1200
      },
      "geometry": { "type": "Point", "coordinates": [-62.715, 8.295] }
    }
  ]
}
```

### `GET /map/tiles/meta`

Metadatos del archivo MBTiles local de Unare (fondo cartográfico offline).

```json
{
  "available": true,
  "path": "/app/data/tiles/unare.mbtiles",
  "minZoom": 12,
  "maxZoom": 16,
  "bounds": { "minLng": -62.81, "minLat": 8.24, "maxLng": -62.69, "maxLat": 8.31 },
  "tileCount": 420,
  "attribution": "© OpenStreetMap contributors"
}
```

Generación: `backend/scripts/generate_unare_mbtiles.sh` (ver `backend/docs/INTEGRATION.md`).

### `GET /map/tiles/{z}/{x}/{y}.png`

Tile raster PNG del bbox Unare (zoom 12–16). Sin autenticación (MapLibre lo consume directamente).

Respuestas: `200` PNG, `404` tile inexistente, `503` MBTiles no generado.

---

## Puntos de recolección — `/api/v1/collection-points`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/summary` | Opcional | KPIs y distribución |
| GET | `/sector-options` | Planificador/Admin | Opciones de sector |
| GET | `/optimization-context` | Opcional | Códigos optimizados recientes |
| GET | `/export` | Opcional | CSV (`format=csv`, `sector`, `status`) |
| GET | `/{code}` | Opcional | Detalle de un punto |
| GET | `/{code}/fill-history` | Opcional | Historial (`days=7`) |
| POST | `/` | Planificador/Admin | Crear punto |
| PATCH | `/{code}` | Planificador/Admin | Actualizar punto |
| DELETE | `/{code}` | Planificador/Admin | Eliminar punto |

### `GET /collection-points/summary`

```json
{
  "kpis": {
    "total": 248,
    "critico": 18,
    "lleno": 36,
    "normal": 186,
    "parcial": 8,
    "fueraDeServicio": 0
  },
  "distribution": [
    { "status": "normal", "label": "Normal", "count": 186, "pct": 75 }
  ],
  "sectors": ["Unare I", "Unare II"]
}
```

### `POST /collection-points`

```json
{
  "sectorId": 1,
  "code": "CP-250",
  "latitude": 8.295,
  "longitude": -62.715,
  "maxCapacityKg": 1200,
  "currentFillLevelKg": 400,
  "status": "active"
}
```

### `PATCH /collection-points/{code}`

Campos opcionales: `sectorId`, `latitude`, `longitude`, `maxCapacityKg`, `currentFillLevelKg`, `status`, `priorityBoost`, `fillRateFactorOverride`, `estimatedFillHours`, `generationRateKgPerDay`, `servedPopulation`.

### Tasa de generación (zonas y contenedores)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/sectors/fill-rate-factors` | Planificador/Admin | Factores de llenado y generación por zona |
| GET | `/sectors/summary` | Planificador/Admin | Agregado por zona (contenedores, capacidad, generación y rebose) |
| PATCH | `/sectors/{id}/fill-rate-factor` | Planificador/Admin | Factor de llenado de la zona |
| PATCH | `/sectors/{id}/generation-rate` | Planificador/Admin | Tasa de la zona (manual/per cápita) y modo de reparto |
| POST | `/collection-points/calibrate` | Planificador/Admin | Calibra las tasas con los pesos recolectados |

`PATCH /sectors/{id}/generation-rate` — body parcial:

```json
{
  "generationRateKgPerDay": 600,
  "perCapitaKgPerDay": 0.75,
  "distributionMode": "capacity"
}
```

- **Tasa de la zona** (kg/día): `perCapitaKgPerDay × population` si hay per cápita y
  población; si no, `generationRateKgPerDay` (manual). `null` limpia el valor.
- **`distributionMode`**: `equal` (igual para todos), `capacity` (proporcional a la
  capacidad) o `population` (proporcional a `servedPopulation`; cae a capacidad y luego
  a iguales si faltan datos).
- La zona se **redistribuye** al cambiar su config y al crear/eliminar/reasignar contenedores.

`GET /sectors/summary`:

```json
[
  {
    "id": 1,
    "name": "Unare I",
    "fillRateFactor": 1.4,
    "population": 4200,
    "perCapitaKgPerDay": 0.75,
    "distributionMode": "capacity",
    "configuredGenerationRateKgPerDay": 600.0,
    "generationRateKgPerDay": 3150.0,
    "containerCount": 4,
    "totalCapacityKg": 4400.0,
    "effectiveGenerationRateKgPerDay": 3150.0,
    "effectiveGenerationRateKgPerHour": 131.25,
    "avgFillPct": 52,
    "criticalCount": 1,
    "overflowCount": 0
  }
]
```

`POST /collection-points/calibrate` — body opcional `{ "days": 30, "sectorId": 1, "alpha": 0.4 }`.
Estima la tasa por contenedor con EWMA de las muestras `peso / horas` entre
recolecciones consecutivas (pesos reales de `route_waypoints.collected_weight_kg`) y
la escribe en `generationRateKgPerDay`. Omite contenedores cuya zona gestiona la tasa.

```json
{
  "windowDays": 30,
  "alpha": 0.4,
  "calibratedCount": 12,
  "skippedCount": 3,
  "calibrated": [
    { "code": "CNT-001", "samples": 4, "previousRateKgPerDay": null, "rateKgPerDay": 360.0 }
  ],
  "skipped": [{ "code": "CNT-002", "reason": "zone_managed" }]
}
```

En el detalle de un contenedor (`GET /collection-points/{code}`) se exponen
`estimatedFillHours`, `effectiveFillHours`, `generationRateKgPerDay` (efectiva),
`generationRateOverrideKgPerDay` (tasa propia, `null` si es derivada), `servedPopulation`,
`overflowKg`, `overflowPct`, `lastCalibratedAt` y `calibrationSamples`.

Precedencia de la tasa efectiva: tasa del contenedor (`generationRateKgPerDay` en el
contenedor) > capacidad ÷ horas base ajustadas por el factor. Una tasa por contenedor y
una tasa gestionada por la zona no coexisten (409/422 si se intentan definir ambas).

### Rebose y penalización en el objetivo

El **rebose** (`overflowKg = llenado proyectado sin recortar − capacidad`) se expone por
contenedor y se cuenta por zona (`overflowCount`). El motor ACO puede incluir una
**penalización por rebose** en su función objetivo: cada contenedor servido después de
su hora de desborde suma `kg rebosados × OVERFLOW_PENALTY_WEIGHT` al costo de la
solución (los no atendidos rebosan hasta el fin de jornada). La distancia reportada sigue
siendo pura (sin penalización). El peso se configura desde la pestaña *Parámetros del
algoritmo* en `/optimization` (`PATCH /admin/algorithm-settings`); por defecto está
desactivada (`overflowPenaltyWeight = 0`).

---

## Vehículos — `/api/v1/vehicles`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/` | No | Listado de flota |
| GET | `/summary` | No | KPIs de flota |
| GET | `/optimization-context` | No | Contexto de última optimización |
| GET | `/export` | Planificador/Admin | CSV (`status`, `assignable`, `q`) |
| GET | `/{code}` | No | Detalle |
| GET | `/{code}/incidents` | No | Historial de mantenimiento |
| PATCH | `/{code}` | Planificador/Admin | Actualizar estado o conductor por defecto |

### Item de vehículo (listado/detalle)

```json
{
  "id": "TR-08",
  "plate": "A12BC3D",
  "status": "en-ruta",
  "maxCapacityKg": 15000,
  "fuelConsumptionRate": 0.28,
  "driver": "Juan Pérez",
  "driverPhone": "+58 414-555-0192",
  "defaultDriverId": 1,
  "driverId": 1,
  "idealOperatorsCount": 6,
  "assignedOperatorsCount": null,
  "type": "Compactador",
  "fuelPct": 78,
  "capacityPct": 65,
  "capacityM3": 15,
  "model": "HINO 300",
  "year": 2022,
  "mileageKm": 45230,
  "base": "Base Unare",
  "updatedAt": "25/06/2026 09:25 AM"
}
```

Estados API internos: `available`, `in_route`, `maintenance`, `inactive` (mapeados a español en frontend).

#### Dotación de cuadrilla (ADR-003)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `idealOperatorsCount` | int | Dotación ideal del camión: **6 = 1 conductor + 5 operarios** (default tras Fase 1). |
| `assignedOperatorsCount` | int \| null | Cuadrilla asignada hoy (`1…ideal`). `null` = dotación completa. **PATCH Fase 1.** |

El tiempo de servicio por parada se calcula a partir de estos valores en **KPIs** (no en el fitness del ACO). Ver [docs/fase-8/adr-dotacion-tiempo-servicio.md](../docs/fase-8/adr-dotacion-tiempo-servicio.md).

### `PATCH /vehicles/{code}`

```json
{
  "status": "maintenance",
  "defaultDriverId": 3,
  "assignedOperatorsCount": 5
}
```

`defaultDriverId: null` desasigna el conductor por defecto. `driverId` en la respuesta refleja el conductor efectivo (ruta activa o default). `assignedOperatorsCount` (contrato Fase 1) — cuadrilla total en el camión, conductor incluido.

---

## Conductores — `/api/v1/drivers`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/` | Planificador/Admin | Listado de conductores |
| POST | `/` | Planificador/Admin | Alta de conductor (crea usuario `conductor`) |
| PATCH | `/{id}` | Planificador/Admin | Actualizar datos o estado |

```json
{
  "id": 1,
  "document": "V-0000001",
  "firstName": "Juan",
  "lastName": "Pérez",
  "phone": "+58 414-555-0192",
  "email": "conductor@fero.com",
  "active": true,
  "assignedVehicles": 1
}
```

---

## Rutas — `/api/v1/routes`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/current` | No | Ruta activa (GeoJSON) |
| GET | `/optimized` | No | Última ruta optimizada (GeoJSON) |
| POST | `/dispatch` | Planificador/Admin | Despachar rutas optimizadas |
| POST | `/advance` | Operaciones | Avanzar todas las rutas activas |
| POST | `/{route_id}/advance` | Operaciones | Avanzar una ruta |

### GeoJSON de ruta

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "route-optimized",
        "type": "optimized",
        "label": "Ruta optimizada",
        "distanceKm": 20.1,
        "durationMin": 98
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [[-62.715, 8.295], [-62.724, 8.298]]
      }
    }
  ]
}
```

### `POST /routes/dispatch`

```json
{
  "dispatchedRouteIds": [1, 2],
  "count": 2
}
```

---

## Simulaciones — `/api/v1`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/scenarios` | No | Escenarios disponibles |
| GET | `/kpis?scenario=normal` | No | KPIs por escenario |
| POST | `/simulations/optimize` | Planificador/Admin | Crear job de optimización (asíncrono) |
| GET | `/simulations/jobs/{id}` | Planificador/Admin | Estado, fase, progreso y logs del job |
| POST | `/simulations/jobs/{id}/cancel` | Planificador/Admin | Solicitar cancelación del job |
| GET | `/simulations` | No | Listado paginado de simulaciones |
| GET | `/simulations/{id}` | No | Detalle de simulación |

### `GET /simulations`

**Query params:** `limit` (default 25), `offset` (default 0)

```json
{
  "items": [
    {
      "id": 42,
      "name": "Tráfico normal",
      "executedAt": "2026-08-01T21:00:00+00:00",
      "scenarioId": "normal",
      "savingPercentage": 29.2,
      "contingency": false
    }
  ],
  "total": 12,
  "limit": 25,
  "offset": 0
}
```

### `POST /simulations/optimize`

Encola una optimización ACO y devuelve de inmediato un `jobId`. El cliente debe consultar `GET /simulations/jobs/{id}` (polling) hasta `status=completed`.

**Request**

```json
{
  "scenarioId": "rain",
  "rainIntensity": "alta",
  "wasteLevelPct": 30,
  "estimatedDurationHours": 4,
  "operatorsShortage": 2,
  "acoAnts": 12,
  "acoIterations": 20,
  "workloadBalanceWeight": 1.0,
  "makespanWeight": 2.0,
  "minActiveVehicles": 3,
  "maxRouteHoursTarget": 8
}
```

| Campo | Tipo | Efecto en motor |
|-------|------|-----------------|
| `scenarioId` | string | **Requerido.** Escenario base (`normal`, `peak_traffic`, `rain`, `saturated`, `broken_vehicle`). |
| `rainIntensity` | `baja` \| `media` \| `alta` | Solo si `scenarioId=rain`. Escala `trafficMultiplier` (×1.05, ×1.15, ×1.30). |
| `wasteLevelPct` | 10 \| 20 \| 30 \| 50 | Solo si `scenarioId=saturated`. Suma puntos al `fillLevelBoost` del escenario. |
| `estimatedDurationHours` | 1–12 | Se persiste en `simulationParameters`; **no** modifica el VRP. |
| `operatorsShortage` | 0–5 | Operarios de **campo** ausentes en el turno. Se persiste en `simulationParameters`; afecta **KPIs de duración** (ACO sigue minimizando distancia). |
| `acoAnts` | 4–30 | Hormigas por iteración del ACO. Si se omite, usa `ACO_ANTS` del servidor (default según `APP_ENV`: local 6, staging/prod 12). |
| `acoIterations` | 5–60 | Iteraciones del ACO. Si se omite, usa `ACO_ITERATIONS` del servidor (default según `APP_ENV`: local 10, staging/prod 20). |
| `workloadBalanceWeight` | 0–10 | **Fase 13 — equidad de carga.** Peso de `σ_horas/μ_horas` en el objetivo; reparte las horas de servicio entre camiones. Si se omite, se toma el valor de Administración (**0,5** por defecto); `0` = solo distancia (comportamiento previo, RNF-2). |
| `makespanWeight` | 0–10 | **Fase 13 — makespan.** Peso de `T_max/H_jornada`; acorta la ruta más larga. Si se omite, se toma el valor de Administración (**1** por defecto); `0` = solo distancia. |
| `minActiveVehicles` | 1–100 | **Fase 13 — uso de flota.** Restricción de vehículos activos por día. Si es infactible (más vehículos que puntos programados) se **degrada con warning** en vez de fallar. |
| `maxRouteHoursTarget` | 1–18 | **Fase 13.** Jornada objetivo (h) del KPI `finishUnderTargetPct` (default `8`). |

`simulationParameters` también incluye `acoAnts`, `acoIterations` y `appliedCrewModifiers` cuando aplica.

**Optimizaciones del motor (Fase A–B):**

| Variable | Default | Efecto |
|----------|---------|--------|
| `ACO_PATIENCE` | `5` | Parada anticipada si la mejor distancia no mejora en N iteraciones (`0` = desactivado). |
| Matriz en caché | `data/cache/matrices/` | Reutiliza distancias si coinciden depósito, puntos, escenario y `trafficMultiplier`. |
| `ACO_PARALLEL_WORKERS` | `0` (auto) | Hormigas por iteración en procesos paralelos (`1` = secuencial, `N` = workers explícitos). |
| `OPTIMIZATION_MAX_WORKERS` | `2` | Máximo de jobs de optimización ejecutándose a la vez en el servidor. |
| `MATRIX_INCREMENTAL_MAX_ADDITIONS` | `3` | Máximo de puntos nuevos al parchear matriz desde caché padre. |

`engineMetrics.acoParallelWorkers` indica cuántos procesos usó el ACO. `graphLoadSource` puede ser `memory`, `disk`, `graphml` u `osmnx`. La matriz incremental reutiliza una corrida anterior como submatriz (contingencia) o parchea filas/columnas nuevas. El grafo se pre-calienta con `just seed` o `just warm-graph` en `data/cache/unare_graph.pkl`.

**Matriz objetivo vs reporte (ADR-003, Fase 13):** el ACO minimiza un objetivo **combinado configurable** (por defecto, equidad `0,5` + makespan `1`; con ambos en `0` = solo distancia); los KPIs y `estimatedDurationSeconds` de rutas incluyen **viaje + tiempo en paradas** según dotación. La Fase 13 añade los pesos de equidad y makespan (arriba) y la restricción de flota mínima.

**KPIs de duración (`result.kpis`):**

```json
{
  "durationHours": { "current": 4.2, "optimized": 3.1 },
  "durationBreakdown": {
    "optimized": {
      "travelHours": 2.4,
      "serviceHours": 0.7,
      "crewLabel": "4/6 (conductor + 3 operarios)",
      "crewAssignment": "4/6",
      "stopCount": 12
    }
  },
  "exceedsWorkday": { "current": false, "optimized": false },
  "workdayHours": 8,
  "engineMetrics": {
    "computationSeconds": 12.4,
    "acoSeconds": 3.8,
    "graphLoadSeconds": 6.1,
    "overheadSeconds": 2.5,
    "acoAnts": 12,
    "acoIterations": 20,
    "acoIterationsRun": 14,
    "acoStoppedEarly": true,
    "acoPatience": 5,
    "matrixCacheHit": true,
    "acoParallelWorkers": 2,
    "acoConvergence": [
      { "iteration": 1, "bestDistanceKm": 32.4, "iterationBestDistanceKm": 32.4 },
      { "iteration": 14, "bestDistanceKm": 23.0, "iterationBestDistanceKm": 23.4 }
    ],
    "customers": 20,
    "vehicles": 4
  }
}
```

`engineMetrics` mide el **tiempo real de CPU/servidor** (no la duración operativa de la ruta). Variables de entorno: `ACO_ANTS`, `ACO_ITERATIONS`, `ACO_PATIENCE`, `ACO_PARALLEL_WORKERS`, `OPTIMIZATION_MAX_WORKERS` (ver `.env.example`). En producción/defensa: `VITE_ACO_PRESET_DEFAULT=precise` preselecciona el perfil «Preciso» en la UI.

**KPIs multiobjetivo (Fase 13, aditivos):**

```json
{
  "activeVehicles": 6,
  "fleetUtilizationPct": 75.0,
  "vehicleWorkloadHours": [7.5, 7.4, 7.6, 7.3, 7.5, 7.4, 0.0, 0.0],
  "maxRouteHours": 7.62,
  "shiftSlackHours": 4.38,
  "finishUnderTargetPct": 100.0,
  "maxRouteHoursTarget": 8.0,
  "workloadStdHours": 0.12,
  "fairnessIndex": 0.98
}
```

| KPI | Fórmula | Objetivo |
|-----|---------|----------|
| `activeVehicles` | nº de rutas con paradas | uso de flota |
| `fleetUtilizationPct` | `activeVehicles / vehículos asignables × 100` | uso de flota |
| `vehicleWorkloadHours` | horas de servicio por vehículo de la flota (0 si ocioso) | servicio |
| `maxRouteHours` | `max(horas_v)` (makespan) | servicio |
| `shiftSlackHours` | `H_jornada − maxRouteHours` | servicio |
| `finishUnderTargetPct` | % de rutas activas con `horas_v ≤ maxRouteHoursTarget` | servicio |
| `workloadStdHours` | `σ(horas_v)` sobre rutas activas | equidad |
| `fairnessIndex` | `1 − σ_horas/μ_horas` (0–1) | equidad |

El plan operativo semanal (`weekly_plans.operational_plan_json`) añade `weekly.distinctVehiclesWeek`, `weekly.vehicleDaysUsed`, `weekly.usageStdDays` y `weekly.rotationIndex` cuando la rotación de flota está activa. Ver [evidencia Fase 13](../../docs/fase-13/evidencia-multiobjetivo.md).

**Observabilidad (Fase D — tesis):**

| Métrica / artefacto | Dónde | Uso en defensa |
|---------------------|-------|----------------|
| `graphLoadSeconds`, `acoSeconds`, `overheadSeconds` | `engineMetrics` | Desglose de tiempo de CPU vs. calidad |
| `acoConvergence` | `engineMetrics` y polling del job | Curva `best_cost` por iteración ACO |
| Benchmark 5×3 | `GET/POST /benchmarks/aco` | Tabla y gráfico tiempo vs. % ahorro km |

`acoConvergence` registra por iteración la mejor distancia global (`bestDistanceKm`) y la mejor de la iteración (`iterationBestDistanceKm`), en km. Durante la ejecución el cliente puede leer `acoConvergence` en `GET /simulations/jobs/{id}` para dibujar la curva en vivo.

### Benchmark ACO — `/api/v1/benchmarks/aco`

Ejecuta **5 escenarios** (`normal`, `peak_traffic`, `rain`, `saturated`, `broken_vehicle`) × **3 perfiles** (Rápido 6×10, Estándar 12×20, Preciso 20×40) sin persistir simulaciones. Guarda el resultado en `data/cache/benchmarks/aco_latest.json`.

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/benchmarks/aco` | Planificador/Admin | Último benchmark generado (404 si no existe) |
| POST | `/benchmarks/aco` | Planificador/Admin | Regenera el benchmark (puede tardar varios minutos) |

CLI equivalente: `just benchmark-aco`.

**Response (extracto)**

```json
{
  "generatedAt": "2026-08-10T16:00:00+00:00",
  "durationSeconds": 142.5,
  "scenarioCount": 5,
  "profileCount": 3,
  "runs": [
    {
      "scenarioId": "normal",
      "scenarioLabel": "Tráfico normal",
      "profileId": "standard",
      "profileLabel": "Estándar",
      "computationSeconds": 8.4,
      "graphLoadSeconds": 0.1,
      "acoSeconds": 2.1,
      "overheadSeconds": 1.7,
      "savingPct": 31.0,
      "acoIterationsRun": 14,
      "acoStoppedEarly": true,
      "matrixCacheHit": true
    }
  ]
}
```

Interpretación para la defensa: más hormigas/iteraciones no siempre son proporcionales al ahorro de km; **early stop** + **caché de matriz** suelen capturar ~80 % de la ganancia con mucho menos CPU.

`estimatedDurationHours` en el request define `workdayHours` para la bandera `exceedsWorkday` (default 8 h si se omite).

### Calibración del motor — `/api/v1/benchmarks/*`

Consola de calibración (Fase 13 · [plan](../../docs/fase-13/plan-vista-calibracion.md)): ejecuta los barridos del motor como **job asíncrono** con progreso real y cancelación, y lee la evidencia **de la base de datos** ([ADR-011](../../docs/fase-13/adr-011-calibracion-en-bd.md)). La métrica primaria es la **distancia optimizada**; el makespan y el rebose actúan como guardarraíles.

**Almacenamiento.** Cada corrida completada deja una fila en la tabla `calibration_sweeps`: barrido, escenario, semilla, resumen tipado (`duration_seconds`, `runs_total`, `runs_failed`, `best_distance_km`) y el payload íntegro en `payload_json`. La corrida **vigente** de un barrido es su fila más reciente; no hay caché en fichero (`data/cache/phase3|phase13` se retiró en la migración `035_calibration_sweeps`).

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/benchmarks/aco/sensitivity` | Planificador/Admin | Sensibilidad ACO vigente (404 si nunca corrió) |
| POST | `/benchmarks/aco/sensitivity` | Planificador/Admin | Barrido **síncrono** (~315 s). Acepta `scenarioId` y `seed` por query |
| POST | `/benchmarks/aco/sensitivity/jobs` | Planificador/Admin | Lanza el barrido como job → **202** `{jobId}` |
| GET | `/benchmarks/objective/sweep` | Planificador/Admin | Barrido de pesos vigente + frontera de Pareto + AC-1/AC-2/AC-3 (404 si nunca corrió) |
| POST | `/benchmarks/objective/sweep/jobs` | Planificador/Admin | Lanza el barrido de pesos como job → **202** `{jobId}` |
| GET | `/benchmarks/aco/validation` | Planificador/Admin | Validación vigente de la combinación (404 si no se ha lanzado) |
| POST | `/benchmarks/aco/validation/jobs` | Planificador/Admin | Valida la combinación contra el perfil estándar → **202** `{jobId}` |
| GET | `/benchmarks/calibration/jobs/{jobId}` | Planificador/Admin | Estado, progreso y resultado del job |
| POST | `/benchmarks/calibration/jobs/{jobId}/cancel` | Planificador/Admin | Solicita la cancelación |
| GET | `/benchmarks/calibration/history?limit=&offset=` | Planificador/Admin | Corridas guardadas (historial de `calibration_sweeps`) |
| GET | `/benchmarks/calibration/history/{runId}` | Planificador/Admin | Payload completo de una corrida histórica |
| GET | `/simulations/jobs?jobType=calibration` | Planificador/Admin | Journal de los jobs de calibración (progreso y logs) |

**Cuerpo de los `POST .../jobs`**

| Endpoint | Cuerpo |
|---|---|
| `/benchmarks/aco/sensitivity/jobs` | `{ scenarioId?, seed?, refresh? }` |
| `/benchmarks/objective/sweep/jobs` | `{ scenarioId?, seed?, refresh?, durationHours? }` |
| `/benchmarks/aco/validation/jobs` | `{ scenarioId?, seed?, refresh?, profile? }` |

- `scenarioId` (default `normal`) y `seed` (default `42`) viajan explícitos para que la evidencia sea reproducible.
- `refresh` (default `true`) fuerza el recálculo. Con `refresh=false`, si la BD ya tiene una corrida vigente del mismo escenario/semilla, el job nace `completed` con ese payload y no recalcula.
- `durationHours` es una **declaración**, no una perilla: los casos del barrido fijan las jornadas (`8 h` para la serie de aceptación AC-2 y la jornada por defecto del motor para el resto) y de ese valor dependen las líneas base de AC-1/AC-2. Se acepta `8` o el campo omitido; cualquier otro valor devuelve **400** explicando por qué, en vez de ignorarse en silencio.
- Los campos extra que no pertenezcan al contrato se ignoran, como en el resto de la API.
- `profile` (solo validación) es la combinación ACO a probar: `{ acoAnts, acoIterations, acoAlpha, acoBeta, acoRho, pheromoneQ }`. La deriva la vista desde el barrido de sensibilidad (mejor nivel medido de cada eje no estable) y el backend solo valida rangos; omitirla equivale al perfil estándar (`12×20 · α1 β3 ρ0.12 Q1`) y el payload lo marca con `sameParams`.

**Validación de la combinación (cierra el hueco OFAT).** El barrido de sensibilidad mide un eje a la vez, así que la recomendación «mejor nivel por eje» es una extrapolación. `POST /benchmarks/aco/validation/jobs` corre **dos optimizaciones en la misma sesión** (misma instancia y semilla): el perfil estándar como control y la combinación propuesta. El payload guarda `standardParams`, `profile`, los dos `runs` y un `verdict`:

| Campo del `verdict` | Significado |
|---|---|
| `outcome` | `better` · `equal` · `worse` · `not-comparable` |
| `reason` | Motivo cuando no es comparable: `error`, `uncovered`, `missing` |
| `standardKm`, `recommendedKm` | Distancia optimizada de cada corrida |
| `deltaKm`, `deltaPct` | Combinación − estándar (negativo = mejora) |

El umbral de empate es el mismo 0,5 % que marca un eje como estable en la vista. La validación **no** tiene pestaña de resultados: vive en el panel de recomendación. A diferencia de los barridos, `refresh=false` no reutiliza la corrida vigente (son 2 corridas y la guardada sería de otra combinación). No es un estudio de interacción ni una búsqueda multi-semilla: confirma o refuta la recomendación OFAT.

**Estados:** `pending` · `running` · `completed` · `cancelled` · `failed`.

**Response de `GET /benchmarks/calibration/jobs/{jobId}`**

```json
{
  "jobId": "…",
  "jobType": "calibration",
  "sweep": "sensitivity",
  "status": "running",
  "phase": "Sensibilidad ACO",
  "progress": 23,
  "current": 5,
  "total": 18,
  "currentLabel": "20 hormigas",
  "startedAt": "2026-09-17T15:01:00+00:00",
  "finishedAt": null,
  "result": null,
  "error": null,
  "logs": [
    {
      "id": "log-…-4",
      "timestamp": "15:03:12",
      "message": "[5/18] 20 hormigas",
      "type": "progress",
      "phaseId": "sensitivity"
    }
  ]
}
```

`current` es la corrida **en curso** (1-based) y `progress` el porcentaje de corridas **terminadas**: el progreso nunca retrocede. Al completar, `result` trae el payload del barrido y la corrida queda guardada en `calibration_sweeps`. Ese journal de job es lo único que sigue viviendo en `optimization_jobs`.

**Sello de instancia (informativo).** Cada payload guarda `instanceFingerprint` al generarse y los `GET` de resultados añaden:

| Campo | Significado |
|---|---|
| `instanceFingerprint` | Sello con el que se generó (`null` si no se declaró) |
| `currentFingerprint` | Sello de la instancia vigente |
| `cacheState` | `fresh` (coincide) · `stale` (la instancia cambió desde entonces) · `unknown` (sin sello) |
| `stale` | Atajo booleano de `cacheState == "stale"` |

El sello combina el **epoch de seed** (`data/cache/seed_epoch.json`, lo escribe `just seed`), el escenario, número y última edición de puntos, vehículos y zonas, y depósito, vertedero y jornada por defecto. Con la evidencia en la BD ya no hay dos fuentes que conciliar: el sello solo dice si la corrida describe la instancia **actual** (por ejemplo, si cambiaste puntos o flota después de calcularla). La vista ya no muestra un banner por esto; el estado aparece como columna del historial y como aviso en el panel de validación.

**Historial.** Cada corrida completada deja una fila en `calibration_sweeps` (la escriben los propios servicios del barrido, tanto por API/UI como por CLI). `GET /benchmarks/calibration/history` las lista con su `cacheState` y `GET .../history/{runId}` devuelve el payload completo; abrir una corrida histórica no cambia la vigente.

**Cancelación:** se aplica **entre corridas** (no interrumpe el ACO en curso) y **no** guarda la corrida: el job queda en `cancelled` con `result = null` y la tabla no crece. Corre **un barrido a la vez** (semáforo de calibración); el siguiente espera su turno.

CLI equivalente: `just phase3-sensitivity` (sensibilidad) y `just phase13-sweep` (pesos).

### Decisión de diseño: ACO en distancia, KPIs en tiempo operativo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué minimiza el ACO? | **Distancia recorrida** (metros en la red vial). El fitness y el 2-opt **no** incluyen tiempo de servicio en paradas. |
| ¿Qué reportan los KPIs? | **Duración operativa** = tiempo de viaje + Σ (paradas × tiempo de servicio por dotación). |
| ¿Por qué separar? | Dos corridas con la **misma ruta en km** pueden tener **distinta duración** si cambia la dotación — riesgo de no cerrar la jornada aunque la ruta sea óptima en distancia. |

### Fórmula de tiempo de servicio (ADR-003)

Constantes: `BASE_SERVICE_SECONDS = 1200` (20 min/punto con dotación completa), penalización `180` s (3 min) por operario de campo faltante.

```
assignedEfectivo = max(1, assignedVehículo − operatorsShortage)
fieldIdeal       = idealOperators − 1
fieldAssigned    = max(0, assignedEfectivo − 1)
missingField     = max(0, fieldIdeal − fieldAssigned)

serviceTimeSec   = 1200 + missingField × 180
durationSec      = travelSec + stopCount × serviceTimeSec
```

**Ejemplos (ideal = 6, dotación completa en vehículo):**

| operatorsShortage | assignedEfectivo | s/punto | min/punto |
|-------------------|------------------|---------|-----------|
| 0 | 6 | 1200 | 20:00 |
| 1 | 5 | 1380 | 23:00 |
| 2 | 4 | 1560 | 26:00 |

El conductor **no** se resta con `operatorsShortage`. Código: `backend/app/domain/crew_service_time.py`. ADR: [docs/fase-8/adr-dotacion-tiempo-servicio.md](../../docs/fase-8/adr-dotacion-tiempo-servicio.md).

### Vertedero multi-viaje y jornada operativa (ADR-004)

**Estado:** Fase 0 (contrato). **Fase 1:** campos persistidos en `OperationalSettings` y UI admin. Motor en Fase 2.

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué hace el ACO con el vertedero? | **Nada en el fitness.** Sigue minimizando distancia. Las visitas al vertedero son consecuencia de la restricción de capacidad (multi-viaje). |
| ¿Qué reportan los KPIs? | **Duración operativa** = viaje + paradas (ADR-003) + descargas en vertedero + corte por jornada 06:00–18:00. |
| ¿Por qué separar? | Dos corridas con la **misma ruta en km** pueden tener **distinta duración** si cambia el tiempo de descarga o la jornada — y pueden dejar contenedores sin cubrir. |

**Instalaciones (contrato `OperationalSettings`, Fase 1):**

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `depotLat` | float | `-62.715` | Latitud depósito (base) |
| `depotLon` | float | `8.295` | Longitud depósito |
| `landfillLat` | float | `-62.690` | Latitud vertedero (placeholder editable) |
| `landfillLon` | float | `8.280` | Longitud vertedero |
| `landfillUnloadMinutes` | int | `15` | Tiempo de descarga por visita |
| `workStart` | string | `"06:00"` | Inicio jornada (`HH:MM`) |
| `workEnd` | string | `"18:00"` | Fin jornada (`HH:MM`) |

**Índices del motor (Fase 2):** `0` = depósito · `1…N` = contenedores · `N+1` = vertedero.

**Fórmulas:**

```
landfillUnloadSec = landfillUnloadMinutes × 60
shiftBudgetSec    = secondsBetween(workStart, workEnd)   // 06:00→18:00 = 43 200 s

elapsedSec = travelSec
           + (n_collection_stops × serviceTimeSec)
           + (n_landfill_visits × landfillUnloadSec)

canFitStop = elapsedSec + travelTo(candidate) + serviceAt(candidate) ≤ shiftBudgetSec
```

Si `canFitStop` es falso → cerrar ruta (vertedero si `load > 0`, luego depósito); contenedores restantes en `uncoveredPointCodes`.

**KPIs (Fase 2–3):**

```json
{
  "landfillTrips": 2,
  "landfillTripsPerVehicle": 1.0,
  "unloadTimeHours": 0.5,
  "shiftUtilizationPct": 30,
  "uncoveredPoints": 3,
  "uncoveredPointCodes": ["CNT-042", "CNT-043", "CNT-044"],
  "durationBreakdown": {
    "optimized": {
      "travelHours": 2.4,
      "serviceHours": 0.7,
      "unloadHours": 0.5,
      "landfillTrips": 2,
      "shiftBudgetHours": 12.0,
      "shiftUsedHours": 3.6,
      "shiftUtilizationPct": 30,
      "uncoveredPoints": 3
    }
  }
}
```

**GeoJSON rutas (Fase 3):** cada `Feature` LineString incluye `properties.stops[]` con `stopType: "collection"` o `"landfill"` (código `VERTEDERO`).

**Playback (Fase 3 / Fase 10):** cada parada en `stops[]` incluye `stopType: "collection"` o `"landfill"`. Vertedero: `code: "VERTEDERO"` y `serviceMinutes` según `landfillUnloadMinutes` (default 15). Contrato: [docs/fase-10/README.md](../../docs/fase-10/README.md).

Código: `backend/app/domain/landfill_service_time.py`, `src/core/types/landfillServiceTime.ts`. ADR: [docs/fase-9/adr-vertedero-multi-viaje.md](../../docs/fase-9/adr-vertedero-multi-viaje.md).

**Algoritmo:** ACO (`aco_vrp_osmnx`). Defaults por `APP_ENV`: local `6×10`, staging/prod `12×20`. Parada anticipada (`ACO_PATIENCE`), hormigas en paralelo (`ACO_PARALLEL_WORKERS`) y cola de jobs (`OPTIMIZATION_MAX_WORKERS`). No hay selector de algoritmo en API.

**Response (201)**

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### `GET /simulations/jobs/{id}`

Devuelve el estado en tiempo real del job: fase del motor, progreso (0–100), logs acumulados y resultado final cuando termina.

**Response (en curso)**

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "running",
  "phase": "aco",
  "progress": 58,
  "logs": [
    {
      "id": "log-a1b2-0",
      "timestamp": "14:32:01",
      "message": "Iniciando optimización ACO…",
      "type": "info",
      "phaseId": "aco"
    }
  ],
  "acoConvergence": [
    { "iteration": 1, "bestDistanceKm": 32.1, "iterationBestDistanceKm": 32.4 },
    { "iteration": 2, "bestDistanceKm": 30.8, "iterationBestDistanceKm": 31.2 }
  ],
  "result": null,
  "error": null
}
```

**Response (`status=completed`)**

El campo `result` contiene el mismo payload que antes devolvía el POST síncrono: `simulationId`, `scenarioId`, `kpis`, `routes`, `logs`, `servedPointCodes`.

### `POST /simulations/jobs/{id}/cancel`

Marca el job para cancelación cooperativa. Si el motor aún está en ejecución, hace rollback de la transacción y el job pasa a `status=cancelled`.

**Response**

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "cancelled"
}
```

---

## Dashboard — `/api/v1/dashboard`

### `GET /dashboard/summary`

```json
{
  "kpis": [{ "id": "routes", "title": "Rutas activas", "value": 3 }],
  "fleetSummary": { "activeVehicles": 5, "totalVehicles": 10, "driversOnShift": 4 },
  "weeklyTons": { "labels": ["Lun", "Mar"], "values": [18.0, 19.5] },
  "fleetStatus": { "total": 10, "items": [{ "label": "Activos", "count": 7, "pct": 70 }] },
  "recentAlerts": [{ "title": "...", "detail": "...", "tone": "warning" }],
  "activeRoutes": [{ "id": 1, "name": "Ruta Norte", "progress": 45 }],
  "lastOptimization": { "simulationId": 42, "savingPercentage": 28.5 }
}
```

---

## Monitoreo y alertas — `/api/v1`

### `GET /monitoring/status`

Incluye KPIs, flota en vivo, progreso de rutas, alertas y **contexto geoespacial unificado** (`routes`, `containers`, `mapMetrics`, `liveActivities`, `updatedAt`) — misma forma que `/map/context`.

```json
{
  "kpis": [{ "id": "vehicles", "title": "Vehículos en ruta", "value": "3 / 10", "progress": 30 }],
  "liveFleet": [{ "id": "TR-08", "status": "en-ruta", "lng": -62.715, "lat": 8.295 }],
  "routes": { "type": "FeatureCollection", "features": [] },
  "containers": { "type": "FeatureCollection", "features": [] },
  "mapMetrics": [{ "id": "total", "label": "Contenedores totales", "value": 248, "tone": "green", "icon": "trash" }],
  "liveActivities": [{ "id": "fleet-TR-08", "time": "05:19 PM", "text": "TR-08 avanzó en ruta", "tone": "info" }],
  "updatedAt": "2026-08-01T21:19:00Z"
}
```

### `GET /map/context`

Fuente única de verdad geoespacial para Mapa GIS, Monitoreo y Dashboard.

**Query params opcionales:**

| Param | Descripción |
|-------|-------------|
| `sector` | Filtra contenedores por sector |
| `bbox` | `minLng,minLat,maxLng,maxLat` — filtra flota, rutas y contenedores dentro del rectángulo |

**Bbox operativo Unare (alineado frontend/backend):**

| Origen | Constante | Valor |
|--------|-----------|-------|
| Backend | `graph_service.UNARE_BBOX` | `-62.81, 8.24, -62.69, 8.31` |
| Frontend | `UNARE_BBOX` / `UNARE_BBOX_QUERY` en `src/core/types/geo.ts` | mismo rectángulo |

Formato query recomendado: `bbox=-62.81,8.24,-62.69,8.31`.

**Estados de ruta en capa `routes.features[]`:**

| `status` | Significado | Estilo en mapa (frontend) |
|----------|-------------|---------------------------|
| `pending` | Ruta planificada, aún no despachada | Línea punteada, opacidad ~0.75 |
| `in_progress` | Ruta en ejecución | Línea sólida, opacidad ~0.95 |
| `completed` | Ruta finalizada (opcional en mapa) | Gris tenue / oculta según capa |

Por defecto el mapa operativo muestra `pending` e `in_progress` del **plan diario activo de hoy** (`get_active_daily_plan`: estados `draft`, `optimized`, `dispatched`). Solo rutas `route_kind=optimized` vinculadas al plan. Si no hay plan activo, la capa `routes` queda vacía. Conductores autenticados reciben únicamente su ruta (`driver_id` del perfil).

La geometría de cada ruta sigue el grafo vial OSMnx (`route_geometry_service`); si falla, usa segmentos directos entre paradas.

**Propiedades de `routes.features[].properties`:**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | Identificador estable para UI (`route-{pk}`) |
| `routeId` | number | PK de `optimized_routes` |
| `label` | string | Etiqueta legible (`Ruta TR-08`) |
| `color` | string | Color hex asignado por índice (`ROUTE_COLORS`) |
| `vehicleId` | string | Código del vehículo asignado |
| `status` | string | `pending` \| `in_progress` |
| `routeKind` | string | `optimized` (solo estas se sirven en mapa operativo) |
| `waypointsTotal` | number | Paradas de recolección en la ruta |
| `waypointsDone` | number | Paradas con `waypoint.status=completed` |

Documentación ampliada: `docs/mapa-operativo-unare.md`.

```json
{
  "vehicles": [{ "id": "TR-08", "status": "en-ruta", "lng": -62.715, "lat": 8.295, "route": "Ruta Norte" }],
  "routes": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "properties": {
        "id": "route-1",
        "routeId": 1,
        "label": "Ruta TR-08",
        "color": "#34D634",
        "vehicleId": "TR-08",
        "status": "in_progress",
        "routeKind": "optimized",
        "waypointsTotal": 18,
        "waypointsDone": 6
      },
      "geometry": { "type": "LineString", "coordinates": [[-62.72, 8.29], [-62.71, 8.28]] }
    }]
  },
  "containers": { "type": "FeatureCollection", "features": [] },
  "mapMetrics": [{ "id": "vehicles", "label": "Vehículos activos", "value": 14, "tone": "blue", "icon": "truck" }],
  "liveActivities": [],
  "updatedAt": "2026-08-01T21:19:00Z"
}
```

### `GET /alerts`

Lista alertas activas (excluye `resolved` por defecto) con estadísticas para KPIs.

Query: `active_only` (default `true`).

```json
{
  "alerts": [{ "id": "al-01", "priority": "critica", "status": "nueva", "lifecycleStatus": "open" }],
  "stats": {
    "critical": 3,
    "warning": 2,
    "informational": 1,
    "resolvedToday": 2,
    "totalActive": 6
  }
}
```

### `GET /alerts/activity`

Feed lateral de actividad reciente (cambios de estado).

### `PATCH /alerts/{id}`

Actualiza el ciclo de vida de una alerta.

```json
{ "status": "acknowledged" }
```

Valores: `open` | `acknowledged` | `resolved`. Las alertas resueltas dejan de aparecer en el listado activo.

---

## Administración — `/api/v1/admin`

Requiere rol `administrador`.

### `GET /admin/roles`

Lista de roles disponibles con etiqueta y descripción.

### `GET /admin/users`

Lista usuarios activos (sin eliminados).

### `POST /admin/users`

Crea un usuario.

```json
{
  "email": "nuevo@fero.com",
  "password": "secreto123",
  "firstName": "Nuevo",
  "lastName": "Usuario",
  "role": "planificador",
  "active": true
}
```

### `PATCH /admin/users/{id}`

Actualiza nombre, teléfono, rol, sector, estado o contraseña.

### `GET /admin/settings`

Configuración operativa persistida (umbrales, unidades, timeouts, jornada, instalaciones).

Incluye `workStart` / `workEnd` (default `06:00` / `18:00`), coordenadas de depósito y vertedero (`depotLat`, `depotLon`, `landfillLat`, `landfillLon`), y `landfillUnloadMinutes` (default `15`).

### `PATCH /admin/settings`

Actualiza parcialmente la configuración operativa (incl. coordenadas del vertedero y tiempo de descarga).

### `GET /admin/algorithm-settings` · `PATCH /admin/algorithm-settings`

Parámetros del motor de optimización, **editables por planificador/admin** (página **Configuración** → sección *Algoritmo*, `/settings`).

```json
{
  "acoAlpha": 1.0,
  "acoBeta": 3.0,
  "acoRho": 0.12,
  "pheromoneQ": 1.0,
  "pheromoneElitist": false,
  "acoAnts": 8,
  "acoIterations": 20,
  "acoPatience": 5,
  "twoOptPasses": 10,
  "heuristicAtRiskMultiplier": 1.5,
  "heuristicCriticalMultiplier": 1.35,
  "heuristicHighMultiplier": 1.1,
  "matrixCriticalFactor": 0.7,
  "matrixHighFactor": 0.9,
  "overflowPenaltyWeight": 0.0,
  "calibrationDefaultAlpha": 0.4,
  "calibrationWindowDays": 30,
  "workloadBalanceWeight": 0.5,
  "makespanWeight": 1.0,
  "minActiveVehicles": null,
  "maxRouteHoursTarget": 8.0,
  "defaultShiftHours": null,
  "weeklyFleetRotation": false
}
```

- **ACO core:** `acoAlpha` (peso feromona α), `acoBeta` (peso distancia β), `acoRho` (evaporación), `pheromoneQ` (escala de depósito Q), `pheromoneElitist` (refuerza además la mejor solución global), `acoAnts`, `acoIterations`, `acoPatience`, `twoOptPasses` (mejora local 2-opt).

  Fórmulas: `P(c) = τ^α · (1/d)^β · b(c) / Σ_k τ^α · (1/d)^β · b(k)` y `τ ← (1−ρ)·τ + Q / C`.
- **Heurístico de prioridad por llenado:** `heuristicAtRiskMultiplier` (riesgo de calendario), `heuristicCriticalMultiplier` (≥ 80 %), `heuristicHighMultiplier` (≥ 60 %) sesgan la elección de hormiga; `matrixCriticalFactor` / `matrixHighFactor` reducen el costo en la matriz heurística.
- **Generación:** `overflowPenaltyWeight` (m/kg rebosado; 0 = desactivada), `calibrationDefaultAlpha` / `calibrationWindowDays` (defaults de la calibración).
- **Multiobjetivo (Fase 13):** `workloadBalanceWeight` (equidad de carga), `makespanWeight` (duración máxima), `minActiveVehicles` (mínimo de vehículos activos por día, `null` = sin restricción), `maxRouteHoursTarget` (jornada objetivo del KPI de cumplimiento), `defaultShiftHours` (jornada de turno por defecto en horas, `null` = jornada de la instalación; recorta el turno de todas las optimizaciones —incluido el plan semanal— y es el mando que reparte la carga entre más vehículos) y `weeklyFleetRotation` (rotación de flota en el plan operativo semanal). Objetivo: `w_d·D/D_ref + w_b·σ_horas/μ_horas + w_t·T_max/H_jornada`. Por defecto los pesos son `workloadBalanceWeight=0,5` y `makespanWeight=1` (punto recomendado por el barrido de pesos de la Fase 13, medido en el escenario `normal`); con ambos en `0` el motor optimiza solo distancia.
- Actúan como **valores por defecto** de la corrida: si la petición de optimización especifica `acoAnts`/`acoIterations`, esos mandan; el resto siempre se toma de aquí.
- Persistidos en `system_settings` (sección `algorithm`) con auditoría; por defecto toman los valores del entorno / constantes del motor.

### `GET /admin/integrations`

Configuración de integraciones (GIS, telemetría). Disponible en API; UI en próxima fase.

### `PATCH /admin/integrations`

Actualiza integraciones.

### `GET /admin/audit-log?limit=50`

Registro de auditoría de acciones administrativas.

### `POST /admin/seed`

Pobla la base desde `data/seeds/*.json` (borra y repuebla los datos operativos).

### `POST /admin/reset-database`

**Reinicia la base de datos: equivalente a `just db-reset` (parte de datos).** Borra los
datos operativos y los repuebla desde `data/seeds`. No recrea el esquema: las migraciones
se aplican al arrancar el contenedor. Pensado para la UI (botón *Reiniciar base de datos*
en Administración) sin escribir comandos. Tras reiniciar, las sesiones se invalidan y hay
que volver a iniciar sesión. Auditado con `action="reset"`, `resource="database"`.

---

## Planificación operativa — `/api/v1/planning`

### Semanal

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/weekly` | Listar planes semanales |
| GET | `/weekly/current` | Plan aprobado de la semana ISO actual |
| POST | `/weekly` | Crear borrador (`weekStartDate` = lunes) |
| PATCH | `/weekly/{id}` | Actualizar días/escenario |
| POST | `/weekly/{id}/validate` | Job de simulación (`auto_dispatch=false`) |
| POST | `/weekly/{id}/approve` | Aprobar plan semanal |

### Diario

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/daily/{operation_date}` | Obtener o crear plan del día |
| POST | `/daily/{operation_date}/open` | Consolidar programados + `pending_visits` |
| POST | `/daily/{id}/optimize` | Optimizar puntos del día (`auto_dispatch=false`) |
| POST | `/daily/{id}/dispatch` | Despachar rutas del plan |
| POST | `/daily/{id}/close` | Cierre → genera `pending_visits` |

### Pendientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/pending` | Listar visitas pendientes abiertas |
| POST | `/weekly/{id}/autofill-from-schedules` | Generar días desde `visit_schedules` |
| GET | `/weekly/{id}/versions` | Historial de versiones |
| GET | `/weekly/{id}/versions/compare?versionA=&versionB=` | Diff entre versiones |
| GET | `/weekly/{id}/export.pdf` | PDF del plan semanal |
| GET | `/operational-history` | Historial administrativo (API, sin localStorage) |
| GET | `/daily/{id}/export.pdf` | PDF órdenes del día |
| POST | `/pending/{id}/cancel` | Cancelar pendiente |

`GET /planning/pending` acepta `status`, `targetDate`, `originFrom`, `originTo`.

### Frecuencias por punto

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/collection-points/{code}/visit-schedule` | Frecuencia semanal del punto |
| PATCH | `/collection-points/{code}/visit-schedule` | Crear/actualizar frecuencia (días lun–dom) |

`POST /simulations/optimize` acepta además: `planningLevel`, `operationDate`, `collectionPointIds`, `dailyPlanId`, `weeklyPlanId`, `autoDispatch` (default `false` para simulación).

---

## Contingencias — `/api/v1/contingencies`

### `POST /contingencies/vehicle-breakdown`

Requiere rol de operaciones.

```json
{
  "vehicleId": "TR-08",
  "routeId": 1,
  "description": "Falla de motor"
}
```

### `GET /contingencies/recent`

Lista de incidentes recientes reportados.

---

## Analítica y reportes

Query params compartidos (analytics y reports):

| Param | Tipo | Descripción |
|-------|------|-------------|
| `from` | ISO date (`YYYY-MM-DD`) | Inicio del período (inclusive) |
| `to` | ISO date | Fin del período (inclusive) |
| `granularity` | `daily` \| `weekly` \| `monthly` | Agrupación de series temporales |
| `sector` | string (opcional) | Filtra el heatmap por sector |

### `GET /analytics/summary`

KPIs, series de evolución, distribución horaria y rendimiento por ruta. Los datos provienen de simulaciones filtradas por `executed_at`.

Query: `?from=2026-06-01&to=2026-06-25&granularity=daily&sector=Unare%20I`

### `GET /analytics/heatmap`

GeoJSON `FeatureCollection` de puntos con propiedad `weight` (0–1) para el mapa de calor. Filtra puntos de recolección por `sector`; el peso escala con actividad del período.

### `GET /reports/summary`

Resumen operativo con las mismas series filtradas por fecha/granularidad.

### `GET /reports/export?format=csv|pdf`

Descarga binaria (CSV o PDF) respetando los filtros `from`, `to`, `granularity` y `sector`.

---

## Residente — `/api/v1/resident`

Requiere rol `residente` y usuario con `sector_id` asignado. Sin sector → `400`. Otros roles → `403`.

### `GET /resident/overview`

Vista agregada del sector del residente: horario, proximidad del camión, contenedores, rutas activas y avisos derivados.

```json
{
  "sectorName": "Unare I",
  "schedule": {
    "collectionDays": "Lunes, Miércoles, Viernes",
    "window": "07:00 — 12:00",
    "nextCollection": "Viernes 15/08",
    "nextCollectionAt": "2026-08-15T11:00:00+00:00",
    "frequency": "3x/semana",
    "isCollectionDay": true,
    "hasWeeklyPlan": true,
    "hasSchedule": true,
    "source": "weekly_plan",
    "calendar": [
      { "date": "2026-08-13", "weekday": 2, "label": "Miércoles" }
    ]
  },
  "proximity": {
    "status": "approaching",
    "vehicleCode": "TR-08",
    "routeId": 42,
    "estimatedMinutes": 18,
    "stopsBeforeSector": 2,
    "nextStopInSector": "CNT-001",
    "completedStopsInSector": 0,
    "totalStopsInSector": 3,
    "lastUpdatedAt": "2026-08-13T14:30:00+00:00"
  },
  "collectionPoints": [
    {
      "id": "CNT-001",
      "address": "CNT-001",
      "fillLevel": 72,
      "status": "lleno",
      "lastEmptiedAt": "2026-08-10T12:00:00+00:00",
      "lng": -62.75,
      "lat": 8.27
    }
  ],
  "activeRoutesInSector": [
    {
      "routeId": 42,
      "vehicle": "TR-08",
      "status": "in_progress",
      "stopsInSector": 3,
      "pendingStops": 2,
      "nextStop": "CNT-001"
    }
  ],
  "alerts": [
    {
      "title": "Horario de recolección",
      "detail": "Tu sector (Unare I) tiene recolección: Lunes, Miércoles, Viernes · 07:00 — 12:00."
    }
  ],
  "stats": {
    "totalPoints": 12,
    "criticalPoints": 2,
    "routesServingSector": 1
  }
}
```

**`proximity.status`:** `approaching` | `in_sector` | `completed` | `not_scheduled` | `no_active_route`

**`schedule.source`:** `weekly_plan` | `visit_schedules` | `default` | `none`

### `GET /resident/proximity`

Misma validación de rol/sector. Devuelve solo el objeto `proximity` del overview (útil para polling ligero).

---

## Módulos frontend ↔ endpoint

| Módulo `src/core/api/` | Endpoints |
|------------------------|-----------|
| `auth.ts` | `/auth/*` |
| `profile.ts` | `/profile/me`, `/profile/preferences`, `/profile/change-password`, `/profile/sessions`, `/profile/avatar` |
| `sectors.ts` | `/sectors` |
| `collectionPoints.ts` | `/collection-points/*` |
| `vehicles.ts` | `/vehicles/*` |
| `drivers.ts` | `/drivers/*` |
| `routes.ts` | `/routes/*` |
| `simulation.ts` | `/scenarios`, `/kpis`, `/simulations/*` |
| `optimization.ts` | `/simulations/optimize` (job), `/simulations/jobs/*`, `/vehicles/optimization-context`, `/collection-points/optimization-context`, `/routes/dispatch` |
| `simulationJobs.ts` | Polling de jobs de optimización (`start`, `fetch`, `cancel`) |
| `dashboard.ts` | `/dashboard/summary` |
| `monitoring.ts` | `/monitoring/status`, `/routes/advance` |
| `map.ts` | `/map/context` |
| `alerts.ts` | `/alerts`, `/alerts/activity`, `PATCH /alerts/{id}` |
| `analytics.ts` | `/analytics/summary`, `/analytics/heatmap` |
| `reports.ts` | `/reports/*` |
| `admin.ts` | `/admin/*` |
| `resident.ts` | `/resident/overview`, `/resident/proximity` |
| `contingencies.ts` | `/contingencies/*` |

## Vistas sin API dedicada

| Vista | Estado |
|-------|--------|
| `/simulation` | `simulation.ts` + `simulationOperations.ts` → escenarios, KPIs, optimize, historial, contingencias |
| `/admin` | `admin.ts` → usuarios, settings, auditoría (MVP); resto de pestañas próximamente |

---

## Referencia de esquemas Pydantic

Definidos en `backend/app/schemas/`:

- `auth.py` — `LoginRequest`, `TokenResponse`, `UserPublic`
- `profile.py` — `ProfileDetail`, `ProfileUpdate`
- `admin.py` — `AdminUser`, `OperationalSettings`, `AuditLogEntry`
- `driver.py` — `Driver`, `DriverCreate`, `DriverUpdate`
- `collection_point.py` — CRUD y contexto de optimización
- `vehicle.py` — `VehicleUpdate`, `VehicleOptimizationContext`
- `simulation.py` — `OptimizeRequest`
- `contingency.py` — `VehicleBreakdownRequest`

Los tipos TypeScript equivalentes viven en `src/core/types/`.
