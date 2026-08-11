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

Campos opcionales: `sectorId`, `latitude`, `longitude`, `maxCapacityKg`, `currentFillLevelKg`, `status`, `priorityBoost`.

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

### `PATCH /vehicles/{code}`

```json
{
  "status": "maintenance",
  "defaultDriverId": 3
}
```

`defaultDriverId: null` desasigna el conductor por defecto. `driverId` en la respuesta refleja el conductor efectivo (ruta activa o default).

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
| POST | `/simulations/optimize` | Planificador/Admin | Ejecutar optimización |
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

Ejecuta el motor ACO sobre el grafo vial con el escenario indicado.

**Request**

```json
{
  "scenarioId": "rain",
  "rainIntensity": "alta",
  "wasteLevelPct": 30,
  "estimatedDurationHours": 4
}
```

| Campo | Tipo | Efecto en motor |
|-------|------|-----------------|
| `scenarioId` | string | **Requerido.** Escenario base (`normal`, `peak_traffic`, `rain`, `saturated`, `broken_vehicle`). |
| `rainIntensity` | `baja` \| `media` \| `alta` | Solo si `scenarioId=rain`. Escala `trafficMultiplier` (×1.05, ×1.15, ×1.30). |
| `wasteLevelPct` | 10 \| 20 \| 30 \| 50 | Solo si `scenarioId=saturated`. Suma puntos al `fillLevelBoost` del escenario. |
| `estimatedDurationHours` | 1–12 | Se persiste en `simulationParameters`; **no** modifica el VRP. |

**Algoritmo:** siempre ACO (`aco_vrp_osmnx`, 12 hormigas × 20 iteraciones). No hay selector de algoritmo en API.

**Response**

```json
{
  "simulationId": 42,
  "scenarioId": "normal",
  "scenarioName": "Condiciones normales",
  "kpis": {
    "distanceSavingPct": 28.5,
    "timeSavingPct": 31.2,
    "fuelSavingPct": 26.0
  },
  "routesUpdated": true
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

**Query params opcionales:** `sector` (filtra contenedores), `bbox` (`minLng,minLat,maxLng,maxLat`).

```json
{
  "vehicles": [{ "id": "TR-08", "status": "en-ruta", "lng": -62.715, "lat": 8.295, "route": "Ruta Norte" }],
  "routes": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "properties": { "id": "route-1", "label": "Ruta TR-08", "color": "#34D634" },
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

Configuración operativa persistida (umbrales, unidades, timeouts, jornada).

### `PATCH /admin/settings`

Actualiza parcialmente la configuración operativa.

### `GET /admin/integrations`

Configuración de integraciones (GIS, telemetría). Disponible en API; UI en próxima fase.

### `PATCH /admin/integrations`

Actualiza integraciones.

### `GET /admin/audit-log?limit=50`

Registro de auditoría de acciones administrativas.

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

### `GET /resident/overview`

Requiere rol `residente`.

```json
{
  "sectorName": "Unare I",
  "nextCollection": "26/06/2026 — 07:00 AM",
  "nearbyPoints": [{ "id": "045", "fillLevel": 72, "status": "lleno" }],
  "notifications": [{ "title": "Recolección programada", "date": "26/06/2026" }]
}
```

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
| `optimization.ts` | `/simulations/optimize`, `/vehicles/optimization-context`, `/collection-points/optimization-context`, `/routes/dispatch` |
| `dashboard.ts` | `/dashboard/summary` |
| `monitoring.ts` | `/monitoring/status`, `/routes/advance` |
| `map.ts` | `/map/context` |
| `alerts.ts` | `/alerts`, `/alerts/activity`, `PATCH /alerts/{id}` |
| `analytics.ts` | `/analytics/summary`, `/analytics/heatmap` |
| `reports.ts` | `/reports/*` |
| `admin.ts` | `/admin/*` |
| `resident.ts` | `/resident/overview` |
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
