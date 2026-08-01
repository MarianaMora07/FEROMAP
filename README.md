# FEROMAP — Monorepo (frontend + API + motor de optimización)

Prototipo y sistema para el **Sistema Basado en Inteligencia Artificial para la Optimización Dinámica de Rutas de Recolección de Desechos** en la parroquia Unare, Ciudad Guayana (trabajo de grado UNEG 2025–2026).

> El desarrollo activo vive en este repositorio (`FEROMAP/`). La carpeta hermana `proyecto_unare/` quedó como **archivo histórico** del prototipo inicial (ver su `README.md`).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | SolidJS, TypeScript, Vite, Tailwind CSS v4, MapLibre GL |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Optimización | OSMnx, NetworkX, metaheurística ACO (VRP) |
| Base de datos | PostgreSQL + PostGIS |
| Producción | Nginx (SPA + proxy `/api`), imágenes Podman/Docker |
| Orquestación | Compose (`dev` / `prod`), [just](https://github.com/casey/just) |

## Requisitos

- Podman o Docker (+ Compose)
- [just](https://github.com/casey/just)
- Node.js 20+ (solo si desarrollas el frontend fuera de contenedores)

## Inicio rápido (desarrollo)

```bash
cd FEROMAP
just setup
```

Equivale a: `init-env` → `up` → `wait-db` → `health`.

| URL | Servicio |
|-----|----------|
| http://localhost:5173 | Frontend (Vite + HMR) |
| http://localhost:8000 | API FastAPI |
| http://localhost:8000/health | Health check |

Siguientes sesiones:

```bash
just up
```

## Producción local (defensa / demo empaquetada)

Copia la plantilla de producción:

```bash
cp .env.prod.example .env
just setup-prod
```

O configura manualmente `.env`:

| URL | Servicio |
|-----|----------|
| http://localhost:8080 | **UI** (Nginx: SPA + proxy `/api`) |
| http://localhost:8080/health | Health vía Nginx |
| http://localhost:8000 | API directa (opcional, depuración) |

En producción el frontend llama a rutas relativas (`/api/v1/...`); Nginx reenvía al contenedor `api`.

También puedes usar la variable de entorno sin editar `.env`:

```bash
COMPOSE_ENV=prod just rebuild
```

## Flujo de demostración (defensa de grado)

Con `VITE_USE_MOCKS=false` y el stack levantado:

1. **Mapa** (`/map`) — Sectores, contenedores por nivel de llenado, ruta actual (verde).
2. Panel **Resumen operativo** — contenedores críticos (>80%).
3. **Simulación** (`/simulation`) — Elegir escenario → **Optimizar rutas con IA**.
4. **Mapa** — Activar capa *Ruta 02* (azul): geometría del motor Python (OSMnx + ACO).
5. **Dashboard** (`/dashboard`) — KPIs y gráficos comparativos.

Atajo de verificación:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/v1/simulations/optimize \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"normal"}'
```

## Comandos (`just`)

| Comando | Descripción |
|---------|-------------|
| `just setup` | Primera vez (dev): `.env`, contenedores, DB, health |
| `just setup-prod` | Primera vez (prod): rebuild, migrate, seed, health |
| `just up` | Levanta stack según `COMPOSE_ENV` en `.env` |
| `just up-prod` | `COMPOSE_ENV=prod just up` |
| `just down` | Detiene contenedores (conserva PostgreSQL) |
| `just down-volumes` | Detiene y borra volúmenes (`postgres_data/`) |
| `just rebuild` | Reconstruye imágenes y levanta (usa `COMPOSE_ENV`) |
| `just rebuild-prod` | Producción: build estático + API empaquetados |
| `just logs` / `just logs-api` | Logs |
| `just health` | Comprueba API y frontend |
| `just wait-db` | Espera PostgreSQL |
| `just migrate` | Alembic `upgrade head` |
| `just seed` | Pobla BD desde `data/seeds/*.json` |
| `just db-reset` | Borra BD, levanta, migra y seed |
| `just export-seeds` | Mocks TS → `data/seeds/*.json` |
| `just env-info` | Muestra entorno y URLs |
| `just status` | Estado de contenedores |

## Variables de entorno

Copia la plantilla: `just init-env` (dev) o `cp .env.prod.example .env` (prod).

| Variable | Dev (`COMPOSE_ENV=dev`) | Prod (`COMPOSE_ENV=prod`) |
|----------|-------------------------|---------------------------|
| `COMPOSE_ENV` | `dev` | `prod` |
| `APP_ENV` | `local` | `production` |
| `API_PORT` | `8000` | `8000` |
| `FRONTEND_PORT` | `5173` (Vite) | `8080` (Nginx) |
| `DB_HOST` | `db` (contenedor) | `db` o host externo |
| `DATABASE_URL` | `postgresql+psycopg://…@db:5432/feromap` | Igual o RDS/externo |
| `VITE_USE_MOCKS` | `false` para API real | `false` |
| `VITE_API_URL` | `http://localhost:8000` (build) | **vacío** (mismo origen vía Nginx) |
| `VITE_API_PROXY_TARGET` | `http://api:8000` (proxy Vite) | no aplica |
| `CORS_ORIGINS` | `http://localhost:5173` | `http://localhost:8080` |
| `COMPOSE_PROJECT_NAME` | `feromap` | `feromap` |

## Solo frontend (sin contenedores)

```bash
npm install
npm run dev
```

Proxy de Vite: `/api` → `http://localhost:8000` (requiere `just up` o API local).

## Datos y base de datos

Los mocks en `src/data/mock/` son la fuente inicial; se exportan a seeds:

```bash
just export-seeds
just db-reset    # 20 contenedores, 8 sectores, 10 vehículos, …
```

Coordenadas base: `[-62.715, 8.295]` (Parroquia Unare, Puerto Ordaz).

## API REST (`/api/v1`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del API |
| GET | `/api/v1/sectors` | Sectores (GeoJSON) |
| GET | `/api/v1/collection-points` | Contenedores (GeoJSON) |
| GET | `/api/v1/routes/current` | Ruta baseline |
| GET | `/api/v1/routes/optimized` | Última ruta optimizada |
| GET | `/api/v1/dashboard/summary` | Resumen operativo |
| GET | `/api/v1/scenarios` | Escenarios de simulación |
| POST | `/api/v1/simulations/optimize` | Motor ACO/VRP (`{"scenarioId":"normal"}`) |
| GET | `/api/v1/simulations/{id}` | Detalle de simulación |
| GET | `/api/v1/kpis?scenario=` | KPIs por escenario |
| GET | `/api/v1/vehicles` | Flota |

Respuestas en **camelCase**.

## Estructura del monorepo

```
FEROMAP/
├── backend/              # FastAPI, Alembic, motor de optimización
│   └── app/services/     # graph_service, optimization_service, …
├── data/                 # GeoJSON, grafos OSM, seeds, cache
├── deploy/
│   ├── nginx/            # SPA + proxy /api (prod)
│   └── postgres/init/
├── src/                  # Frontend SolidJS
│   ├── core/api/         # Cliente HTTP (mock / API)
│   └── features/
├── compose.yml           # Servicios base
├── compose.dev.yml       # Dev: volúmenes + Vite
├── compose.prod.yml      # Prod: imágenes + Nginx
├── Containerfile         # API producción
├── Containerfile.frontend
├── justfile
└── package.json
```

## Scripts npm (frontend)

```bash
npm run dev       # Vite (desarrollo)
npm run build     # Build estático
npm run preview   # Vista previa del build
```

## Autores

Victor Astudillo · Mariana Mora — Ingeniería en Informática, UNEG Puerto Ordaz
