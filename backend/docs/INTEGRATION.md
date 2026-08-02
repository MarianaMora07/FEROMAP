# Integración reproducible — Backend

Guía para levantar un entorno idéntico en desarrollo, CI y demo de defensa.

## Flujo completo (recomendado)

```bash
# 1. Variables de entorno
just init-env

# 2. Stack Docker (API + PostgreSQL + frontend)
just setup          # up + wait-db + health

# 3. Datos reproducibles
just integration-setup   # export-seeds + migrate + seed

# 4. Verificación end-to-end
just demo-verify
```

## Qué hace cada paso

| Comando | Acción |
|---------|--------|
| `npm run export-seeds` | Exporta mocks TS → `data/seeds/*.json` |
| `just migrate` | `alembic upgrade head` (migraciones 001–008) |
| `just seed` | `python -m scripts.seed_from_mocks` |
| `just integration-setup` | Los tres anteriores en secuencia |
| `just demo-verify` | Curl: login, sectores, optimize, dashboard |

## Archivos de seed requeridos

Generados en `data/seeds/`:

| Archivo | Contenido |
|---------|-----------|
| `parish.json` | Parroquia base |
| `sectors.json` | Sectores GeoJSON |
| `collection_points.json` | Puntos de recolección |
| `vehicles.json` | Flota |
| `drivers.json` | Conductores |
| `routes.json` | Rutas iniciales |
| `scenarios.json` | Escenarios de simulación |
| `kpis.json` | KPIs por escenario |
| `alerts.json` | Alertas seed |
| `monitoring.json` | Plantilla de monitoreo |
| `simulations.json` | Historial de simulaciones |
| `optimization_logs.json` | Logs de optimización |

Si falta algún archivo, `seed_from_mocks.py` falla con:

```
No existe data/seeds/<archivo>.json. Ejecuta: npm run export-seeds
```

## Migraciones Alembic

Orden en `backend/alembic/versions/`:

1. `001_mvp_demo` — esquema base
2. `002_routes_simulation` — rutas y simulaciones
3. `003_road_graph` — grafo vial
4. `004_vehicle_incidents_waypoint_status`
5. `005_users_fleet_extensions`
6. `006_collection_point_priority_boost`
7. `007_vehicle_default_driver`
8. `008_backfill_vehicle_drivers`

Reinicio limpio de BD:

```bash
just db-reset    # down -v + up + migrate + seed
```

## Tests de contrato (sin Docker)

Validan que los seeds existan y tengan estructura mínima:

```bash
cd backend && python -m pytest tests/test_seed_contract.py -v
```

## Tests unitarios (motor, servicios)

```bash
just test          # en contenedor
just test-local    # en host (pip install -r backend/requirements.txt)
```

## Usuarios demo (post-seed)

| Email | Rol | Contraseña |
|-------|-----|------------|
| `admin@fero.com` | administrador | `123456789` |
| `plan@fero.com` | planificador | `123456789` |
| `driver@fero.com` | conductor | `123456789` |
| `resident@fero.com` | residente | `123456789` |

## Frontend — modo mock vs API

En `.env`:

```env
VITE_USE_MOCKS=false           # intentar API primero (default recomendado)
VITE_MOCK_FALLBACK_TOAST=true  # avisar en dev si cae a mock
```

Con `VITE_USE_MOCKS=false` y backend arriba, las vistas conectadas usan datos reales.  
Si el API falla, `withMockFallback` registra en consola y muestra toast (solo dev).

## CI sugerido

```yaml
- run: npm run export-seeds
- run: cd backend && python -m pytest tests/test_seed_contract.py tests/ -v
```

Para integración con BD real, añadir job con PostgreSQL service + `alembic upgrade head` + seed.
