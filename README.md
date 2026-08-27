# FEROMAP — Monorepo (frontend + API + motor de optimización)

Prototipo y sistema para el **Sistema Basado en Inteligencia Artificial para la Optimización Dinámica de Rutas de Recolección de Desechos** en la parroquia Unare, Ciudad Guayana (trabajo de grado UNEG 2025–2026).

**Repositorio:** [github.com/MarianaMora07/FEROMAP](https://github.com/MarianaMora07/FEROMAP)

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | SolidJS, TypeScript, Vite, Tailwind CSS v4, MapLibre GL |
| Backend | FastAPI, SQLAlchemy, Alembic |
| Optimización | OSMnx, NetworkX, metaheurística ACO (VRP) |
| Base de datos | PostgreSQL + PostGIS |
| Producción | Nginx (SPA + proxy `/api`), imágenes Podman/Docker |
| Orquestación | Compose (`dev` / `prod`), [just](https://github.com/casey/just) |

## Requisitos previos

Instala en tu máquina (Linux recomendado):

| Herramienta | Uso |
|-------------|-----|
| [Podman](https://podman.io/) o Docker + Compose | Contenedores (DB, API, frontend) |
| [just](https://github.com/casey/just) | Comandos del proyecto (`just setup`, etc.) |
| Node.js 20+ | Solo si desarrollas el frontend **fuera** de contenedores |
| `curl` | Verificación de salud (`just health`) |

Comprueba que Compose funciona:

```bash
podman compose version   # o: docker compose version
just --version
```

---

## Levantar el entorno (desarrollo)

### 1. Clonar el repositorio

```bash
git clone https://github.com/MarianaMora07/FEROMAP.git
cd FEROMAP
```

### 2. Primera vez — setup completo

Un solo comando crea `.env`, levanta contenedores, espera PostgreSQL y verifica API + frontend:

```bash
just setup
```

Esto ejecuta: `init-env` → `up` → `wait-db` → `health`.

Luego aplica migraciones y datos demo:

```bash
just migrate
just seed
```

Verificación rápida del flujo (login + optimización):

```bash
just defense-verify
```

### 3. Abrir la aplicación

| URL | Servicio |
|-----|----------|
| http://localhost:5173 | **Frontend** (Vite + HMR) |
| http://localhost:5173/login | Inicio de sesión |
| http://localhost:8000 | API FastAPI (directa) |
| http://localhost:8000/health | Health check |

Inicia sesión con `plan@fero.com` / `123456789` (ver tabla de credenciales más abajo).

### 4. Sesiones siguientes

```bash
cd FEROMAP
just up          # levanta contenedores en segundo plano
just health      # opcional: comprobar que todo responde
```

Para detener:

```bash
just down        # conserva datos de PostgreSQL
just down-volumes   # borra también la BD (postgres_data/)
```

### 5. Si algo falla

```bash
just status      # estado de contenedores
just logs-api    # logs del backend
just env-info    # puertos y COMPOSE_ENV activos
```

Reinicio limpio de base de datos y seeds:

```bash
just db-reset    # down-volumes + up + migrate + seed
```

Reconstruir imágenes tras cambiar dependencias (`requirements.txt`, Dockerfiles):

```bash
just rebuild
```

---

## Producción local (defensa / demo empaquetada)

UI estática con Nginx y proxy `/api` al backend:

```bash
git clone https://github.com/MarianaMora07/FEROMAP.git
cd FEROMAP
cp .env.prod.example .env
just setup-prod
```

`setup-prod` hace: build de imágenes → migrate → seed → health → `defense-verify`.

| URL | Servicio |
|-----|----------|
| http://localhost:8080 | **UI** (Nginx: SPA + proxy `/api`) |
| http://localhost:8080/health | Health vía Nginx |
| http://localhost:8000 | API directa (opcional, depuración) |

En producción el frontend usa rutas relativas (`/api/v1/...`); Nginx reenvía al contenedor `api`.

Sin editar `.env` (solo para esta sesión):

```bash
COMPOSE_ENV=prod just rebuild-prod
COMPOSE_ENV=prod just up-prod
```

### EC2 (stop/start automático AWS)

Para que el stack suba solo tras encender la instancia (sin SSH manual), instala la unidad systemd:

```bash
sudo bash deploy/systemd/install-auto-start.sh
sudo systemctl start feroomap
```

Guía completa, pruebas y troubleshooting: **[docs/auto-start.md](docs/auto-start.md)**.

---

## Credenciales demo (autenticación)

Tras `just seed`, inicia sesión en `/login`:

| Email | Rol | Uso en la demo |
|-------|-----|----------------|
| `admin@fero.com` | Administrador | Acceso completo, administración |
| `plan@fero.com` | Planificador | Optimización, reportes, simulación |
| `conductor@fero.com` | Conductor | Monitoreo, avance de ruta, averías |
| `residente@fero.com` | Residente | Mi recolección, puntos de su sector |

**Contraseña (todas):** `123456789`

Variables opcionales para scripts: `DEMO_EMAIL`, `DEMO_PASSWORD`.

---

## Flujo de demostración (defensa de grado)

**Guion detallado (5–7 min):** [docs/fase-6/guion-demo-defensa.md](docs/fase-6/guion-demo-defensa.md)  
**Manual de usuario:** [docs/fase-6/manual-usuario.md](docs/fase-6/manual-usuario.md)

Con `VITE_USE_MOCKS=false` en `.env` y el stack levantado:

1. **Login** — `plan@fero.com` / `123456789`
2. **Dashboard** (`/`) — CTA **Nueva simulación**
3. **Simulación** (`/simulation`) — Configurar escenario → **Ejecutar simulación** → KPIs en paso 3
4. **Acciones post-resultado** — Analítica, reportes o mapa (deep links con `simulationId`)
5. **Historial** — Pestaña Historial en `/simulation`
6. *(Opcional)* **Planificación operativa** (`/optimization`) — Despacho diario (módulo secundario)

Verificación automática:

```bash
just defense-verify
```

Documentación de implementación (fases 0–7): [docs/fase-0/README.md](docs/fase-0/README.md) · [docs/fase-6/README.md](docs/fase-6/README.md) · [docs/fase-7/README.md](docs/fase-7/README.md)

---

## Comandos (`just`)

| Comando | Descripción |
|---------|-------------|
| `just setup` | Primera vez (dev): `.env`, contenedores, DB, health |
| `just setup-prod` | Primera vez (prod): rebuild, migrate, seed, health, `defense-verify` |
| `just up` | Levanta stack según `COMPOSE_ENV` en `.env` |
| `just down` | Detiene contenedores (conserva PostgreSQL) |
| `just down-volumes` | Detiene y borra volúmenes (`postgres_data/`) |
| `just rebuild` | Reconstruye imágenes y levanta |
| `just rebuild-prod` | Producción: build estático + API empaquetados |
| `just health` | Comprueba API y frontend |
| `just defense-verify` | Pre-defensa: health + login + optimize (+ Nginx en prod) |
| `just demo-verify` | Flujo demo rápido (GIS + optimización) |
| `just test` | Tests unitarios (motor ACO + contingencias) |
| `just migrate` | Alembic `upgrade head` |
| `just seed` | Pobla BD desde `data/seeds/*.json` |
| `just db-reset` | Borra BD, levanta, migra y seed |
| `just logs` / `just logs-api` | Logs |
| `just env-info` | Muestra entorno y URLs |
| `just status` | Estado de contenedores |

Lista completa: `just` o `just --list`.

---

## Variables de entorno

| Acción | Comando |
|--------|---------|
| Desarrollo | `just init-env` (copia `.env.example` → `.env`) |
| Producción | `cp .env.prod.example .env` |

| Variable | Dev (`COMPOSE_ENV=dev`) | Prod (`COMPOSE_ENV=prod`) |
|----------|-------------------------|---------------------------|
| `COMPOSE_ENV` | `dev` | `prod` |
| `APP_ENV` | `local` | `production` |
| `API_PORT` | `8000` | `8000` |
| `FRONTEND_PORT` | `5173` (Vite) | `8080` (Nginx) |
| `VITE_USE_MOCKS` | `false` (API real) | `false` |
| `VITE_API_URL` | `http://localhost:8000` | **vacío** (mismo origen vía Nginx) |
| `CORS_ORIGINS` | `http://localhost:5173` | `http://localhost:8080` |
| `JWT_SECRET` | valor de `.env.example` | **cambiar en despliegue real** |

No subas `.env` al repositorio (está en `.gitignore`).

---

## Tests

```bash
just test          # dentro del contenedor api (recomendado)
just test-local    # en el host: pip install -r backend/requirements.txt && cd backend && pytest
```

Cubre el motor ACO/VRP y el servicio de contingencias por avería.

---

## Solo frontend (sin contenedores)

Requiere API levantada (`just up` en otra terminal):

```bash
npm install
npm run dev
```

Proxy de Vite: `/api` → `http://localhost:8000`.

---

## Datos y base de datos

Seeds iniciales en `data/seeds/*.json` (exportables desde mocks TS):

```bash
just export-seeds
just db-reset
```

Coordenadas base: `[-62.715, 8.295]` (Parroquia Unare, Puerto Ordaz).

---

## API REST (`/api/v1`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del API |
| POST | `/api/v1/auth/login` | Inicio de sesión (JWT) |
| GET | `/api/v1/auth/me` | Usuario autenticado |
| GET | `/api/v1/sectors` | Sectores (GeoJSON) |
| GET | `/api/v1/collection-points` | Contenedores (GeoJSON) |
| GET | `/api/v1/routes/current` | Ruta baseline |
| GET | `/api/v1/routes/optimized` | Última ruta optimizada |
| GET | `/api/v1/dashboard/summary` | Resumen operativo |
| POST | `/api/v1/simulations/optimize` | Motor ACO/VRP (planificador/admin) |
| POST | `/api/v1/contingencies/vehicle-breakdown` | Avería y recálculo |
| GET | `/api/v1/reports/summary` | KPIs para reportes |
| GET | `/api/v1/reports/export?format=csv\|pdf` | Exportación |
| GET | `/api/v1/resident/overview` | Vista residente |

Respuestas en **camelCase**.

---

## Estructura del monorepo

```
FEROMAP/
├── backend/              # FastAPI, Alembic, motor de optimización
├── data/                 # GeoJSON, grafos OSM, seeds
├── deploy/nginx/         # SPA + proxy /api (prod)
├── docs/                 # Fases 0–6, manual, guion demo, diagramas
├── src/                  # Frontend SolidJS
├── scripts/              # compose.sh, defense-verify.sh
├── compose.yml           # Servicios base
├── compose.dev.yml       # Dev: volúmenes + Vite
├── compose.prod.yml      # Prod: imágenes + Nginx
├── justfile
└── package.json
```

---

## Autores

Victor Astudillo · Mariana Mora — Ingeniería en Informática, UNEG Puerto Ordaz
