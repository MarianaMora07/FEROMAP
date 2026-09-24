set windows-shell := ["C:\\Program Files\\Git\\bin\\sh.exe", "-c"]
# FEROMAP — FastAPI + SolidJS + PostGIS (COMPOSE_ENV en .env: dev | prod)
set dotenv-load := true

project := env_var_or_default("COMPOSE_PROJECT_NAME", "feromap")
api_port := env_var_or_default("API_PORT", "8000")
frontend_port := env_var_or_default("FRONTEND_PORT", "5173")
compose := "./scripts/compose.sh"

default:
    @just --list

# Construye las imágenes definidas en compose (dev o prod según COMPOSE_ENV).
build: _check
    {{compose}} build

# Construye la imagen de producción del API con Podman (sin levantar el stack).
build-prod-api:
    podman build -f Containerfile -t {{project}}-api:prod .

# Construye la imagen de producción del frontend con Podman.
build-prod-frontend:
    podman build -f Containerfile.frontend -t {{project}}-frontend:prod .

# Detiene y elimina los contenedores (conserva volúmenes de datos).
down: _check
    {{compose}} down

# Detiene contenedores y elimina volúmenes (borra datos de PostgreSQL).
down-volumes: _check
    {{compose}} down -v
    # postgres_data es propiedad del usuario del contenedor (uid 999)
    -podman unshare rm -rf postgres_data 2>/dev/null || rm -rf postgres_data

# Aplica migraciones Alembic en el contenedor API.
migrate: _check
    {{compose}} exec api alembic upgrade head

# Pobla la BD desde data/seeds/*.json y pre-calienta el grafo OSMnx.
seed: _check
    {{compose}} exec api python -m scripts.seed_from_mocks

# Solo pre-calienta data/cache/unare_graph.pkl (sin tocar la BD).
warm-graph: _check
    {{compose}} exec api python -c "from app.services.graph_service import warm_road_graph_cache; print(warm_road_graph_cache())"

# Entorno reproducible para integración: seeds + migraciones + población BD.
integration-setup: migrate seed
    @echo "✅ Entorno de integración listo (migrate + seed)"

# Reinicio completo: borra BD, levanta stack, migra y seed.
db-reset: down-volumes up wait-db migrate seed

# Demo de defensa (Fase 0): BD limpia + verificación automática del flujo.
demo: db-reset demo-verify

# Verifica API + optimización + dashboard (tras `just up` y `just seed`).
demo-verify: _check
    bash ./scripts/demo-verify.sh

# Verificación completa pre-defensa: health + auth + optimize (+ Nginx en prod).
defense-verify: _check
    bash ./scripts/defense-verify.sh

# Verificación de producción: defense-verify + observabilidad (/metrics, request-id).
prod-verify: _check
    bash ./scripts/prod-verify.sh

# Respalda PostgreSQL (formato custom) con retención de copias (BACKUP_KEEP=14).
backup: _check
    bash ./scripts/backup.sh

# Restaura un backup: just restore backups/feromap-YYYYmmdd-HHMMSS.dump
restore file:
    bash ./scripts/restore.sh {{file}}

# Ejecuta tests unitarios del motor y contingencias (en contenedor api).
# Aplica migraciones primero para no fallar por esquema desactualizado; si la BD
# no responde, avisa y ejecuta igual (los tests de integración se saltan).
test: _check
    #!/usr/bin/env bash
    set -euo pipefail
    {{compose}} exec -T api alembic upgrade head \
      || echo "⚠️  Migración omitida (BD no disponible o sin cambios); se ejecutan los tests igual"
    {{compose}} exec -T api pytest tests/ -v --tb=short

# Tests en el host (requiere pip install -r backend/requirements.txt).
test-local:
    cd backend && python -m pytest tests/ -v --tb=short

# Benchmark ACO: 5 escenarios × 3 perfiles → data/cache/benchmarks/aco_latest.json
benchmark-aco: _check
    {{compose}} exec api python -m scripts.benchmark_aco

# Benchmark comparativo de familias (F7): ACO vs heurísticas vs OR-Tools (si está instalado).
benchmark-algorithms: _check
    {{compose}} exec api python -m scripts.benchmark_algorithms

# Sensibilidad ACO (6 corridas: hormigas 8/12/20 + iteraciones 10/20/40)
phase3-sensitivity: _check
    {{compose}} exec api python -m scripts.aco_sensitivity

# Reporte markdown Fase 3 (benchmark + sensibilidad) → docs/fase-3/evidencia-aco.md
phase3-report: _check
    {{compose}} exec api python -m scripts.generate_phase3_report

# Barrido de pesos multiobjetivo (Fase 13) → fila en `calibration_sweeps` (barrido 'objective')
phase13-sweep: _check
    {{compose}} exec api python -m scripts.phase13_sweep

# Evidencia AC-3: rotación de flota en una semana demo real (Fase 13.4)
phase13-weekly: _check
    {{compose}} exec api python -m scripts.phase13_weekly_evidence

# ── Calibración metodológica del motor (docs/fase-13/plan-calibracion-metodologica.md) ──
# Fases C0–C8 (C = calibración). Cada fase guarda su evidencia en calibration_sweeps
# (sweep 'method') y admite --dry-run, --reuse y --run-id N. La misma fase se puede lanzar
# desde la vista de calibración (un job por fase) y su evidencia se lee sin CPU en
# `GET /benchmarks/calibration/method`.
# Verificación en dos pasos: primero --seeds 42,101 (fontanería) y después las 10 semillas.
# --resume reanuda un barrido cortado desde data/cache/phase13/method-<fase>.jsonl (E0).

# C1 · Ruido base: perfil estándar × 10 semillas (~2 min) + análisis de δ y n
calib-noise *args: _check
    {{compose}} exec api python -m scripts.calibration_method noise {{args}}

# C3 · Factorial 2⁴ (α, β, ρ, paciencia) + 4 centros (200 corridas ≈ 59 min) — implementada
calib-factorial *args: _check
    {{compose}} exec api python -m scripts.calibration_method factorial {{args}}

# C3.2 · Eje de presupuesto (hormigas, iteraciones) a trabajo fijo — implementada (E1)
calib-budget *args: _check
    {{compose}} exec api python -m scripts.calibration_method budget {{args}}

# C3.3 · Brazo de control sin corte (perfil estándar y mejor de C3) — implementada (E2)
calib-nocut *args: _check
    {{compose}} exec api python -m scripts.calibration_method nocut {{args}}

# C4 · Razón β/α y validación de Q — implementada (E3)
calib-identify *args: _check
    {{compose}} exec api python -m scripts.calibration_method identify {{args}}

# C5 · Superficie de respuesta local (Box-Behnken: β, ρ, I) — implementada (E7)
calib-rsm *args: _check
    {{compose}} exec api python -m scripts.calibration_method rsm {{args}}

# C6 · Validación replicada de la combinación — implementada (E5)
calib-validate *args: _check
    {{compose}} exec api python -m scripts.calibration_method validate {{args}}

# C7 · Réplica de las candidatas del barrido de pesos — pendiente (E6)
calib-objective *args: _check
    {{compose}} exec api python -m scripts.calibration_method objective {{args}}

# C8 · Reporte del capítulo, desde la BD — implementada (E8)
calib-report *args: _check
    {{compose}} exec api python -m scripts.calibration_method report {{args}}

# Backlog post-grado (OR-Tools, SSE, tráfico live…) — solo documentación, no implementar pre-defensa
roadmap:
    @echo "═══ FEROMAP — backlog post-grado ═══"
    @sed -n '1,80p' docs/post-grado/README.md

# Fase 0: 5 escenarios → data/cache/phase0-baseline-metrics.json (caché caliente)
phase0-baseline: _check
    {{compose}} exec api python -m scripts.phase0_baseline_metrics

# Validación estadística Wilcoxon reproducible → data/cache/statistical-validations.json
# Corre los 5 escenarios en paralelo por semilla (--workers, default min(núcleos, 8));
# --scenario acota a uno y --quick usa 10 corridas para iterar.
wilcoxon *args: _check
    {{compose}} exec api python -m scripts.statistical_validation {{args}}

# Optimización real + tabla de planes por conductor (BD con seed, sin UI)
optimization-driver-report *args:
    bash scripts/optimization-driver-report.sh {{args}}

# Reporte ACO acotado a un caso de estudio (Fase 12.7)
case-study-report case_study_code *args:
    bash scripts/case-study-report.sh {{case_study_code}} {{args}}

# Evidencia comparativa casos demo → docs/fase-12/evidencia-casos-estudio.md
phase12-evidence: _check
    bash scripts/phase12-evidence.sh

# Evidencia académica B5 (D20–D21): 4 reportes + docs/fase-b/evidencia-demo-defensa.md
phase-b-evidence: _check
    bash scripts/phase-b-evidence.sh

# Fase B — checks rápidos (sin ACO lento).
phase-b-check: _check
    {{compose}} exec -T api pytest tests/test_phase_b_weekly_autofill.py tests/test_phase_b_verify.py -v -m "phase_b and not slow"
    npm test -- src/core/auth/permissions.test.ts

# Fase B — verificación completa (D25): phase-a-flow + B1–B3 + UI smoke.
phase-b-verify: _check
    bash scripts/phase-b-verify.sh

# Tests de aislamiento casos de estudio (Fase 12.7)
test-case-study-isolation: _check
    {{compose}} exec -T api pytest tests/test_case_study_isolation.py -v

# Tests frontend: vitest + playwright (API en :8000, VITE_USE_MOCKS=true).
test-frontend:
    npm test
    npm run test:e2e

# Fase A — Día 0: health, logins demo y caso CE-UNARE-NORTE.
phase-a-smoke:
    bash scripts/phase-a-smoke.sh

# Fase A — flujo completo vía API/motor real (~2–3 min). Requiere: just up && just seed
phase-a-flow: _check
    {{compose}} exec -T api pytest tests/test_phase_a_operational_flow.py -v -m phase_a

# Fase A — solo smoke pytest (sin ACO).
phase-a-check: _check
    {{compose}} exec -T api pytest tests/test_phase_a_operational_flow.py -v -m "phase_a and not slow"

# Fase A — E2E smoke + UI (API real; UI sin mocks: VITE_USE_MOCKS=false recomendado).
phase-a-e2e:
    npm run test:e2e -- e2e/phase-a-smoke.spec.ts e2e/phase-a-operational-flow.spec.ts

# Muestra COMPOSE_ENV, credenciales y URLs de los servicios.
env-info: _check
    @echo "COMPOSE_ENV={{env_var_or_default('COMPOSE_ENV', 'dev')}}  →  compose.yml + compose.{{env_var_or_default('COMPOSE_ENV', 'dev')}}.yml"
    @echo "APP_ENV={{env_var_or_default('APP_ENV', '(no definido)')}}"
    @echo "DB: {{env_var_or_default('DB_USERNAME', '?')}}@{{env_var_or_default('DB_HOST', '?')}}/{{env_var_or_default('DB_DATABASE', '?')}}"
    @echo "API:    http://localhost:{{api_port}}"
    @if [ "{{env_var_or_default('COMPOSE_ENV', 'dev')}}" = "prod" ]; then \
      echo "Front:  http://localhost:{{frontend_port}}  (Nginx: SPA + /api)"; \
    else \
      echo "Front:  http://localhost:{{frontend_port}}  (Vite dev)"; \
    fi

# Crea .env desde .env.example si aún no existe.
init-env:
    @if [ ! -f .env ]; then \
      if [ "{{env_var_or_default('COMPOSE_ENV', 'dev')}}" = "prod" ] && [ -f .env.prod.example ]; then \
        cp .env.prod.example .env && echo "✅ Creado .env desde .env.prod.example"; \
      else \
        cp .env.example .env && echo "✅ Creado .env desde .env.example"; \
      fi \
    else \
      echo "ℹ️  .env ya existe; no se modificó."; \
    fi

# Sigue los logs de todos los servicios en tiempo real.
logs: _check
    {{compose}} logs -f

# Logs solo del API.
logs-api: _check
    {{compose}} logs -f api

# Reconstruye imágenes y levanta el stack en segundo plano (usa COMPOSE_ENV de .env).
rebuild: down env-info
    {{compose}} up -d --build

# Producción: COMPOSE_ENV=prod — API empaquetada + frontend estático (Nginx).
rebuild-prod:
    COMPOSE_ENV=prod {{compose}} down
    @COMPOSE_ENV=prod just env-info
    COMPOSE_ENV=prod {{compose}} up -d --build

# Levanta stack de producción sin rebuild.
up-prod:
    COMPOSE_ENV=prod {{compose}} up -d
    @echo "🌐 UI (Nginx) en http://localhost:{{env_var_or_default('FRONTEND_PORT', '8080')}}"
    @echo "🔌 API directa en http://localhost:{{api_port}}/health"

# Actualiza producción tras cambios en el repo: pull + rebuild + migrate + health (sin seed).
deploy:
    git pull --ff-only
    COMPOSE_ENV=prod just rebuild-prod
    COMPOSE_ENV=prod just migrate
    COMPOSE_ENV=prod just health
    @echo "✅ Deploy listo — http://localhost:{{env_var_or_default('FRONTEND_PORT', '8080')}}"

# Primera vez en producción: rebuild + migrate + seed + health + verificación.
setup-prod:
    @test -f .env || cp .env.prod.example .env
    COMPOSE_ENV=prod just rebuild-prod
    COMPOSE_ENV=prod just wait-db
    COMPOSE_ENV=prod just migrate
    COMPOSE_ENV=prod just seed
    COMPOSE_ENV=prod just health
    COMPOSE_ENV=prod just defense-verify
    @echo "✅ Producción lista — http://localhost:{{env_var_or_default('FRONTEND_PORT', '8080')}}"

# Primera vez: init-env + contenedores + espera a PostgreSQL + verificación de salud.
setup: init-env up wait-db health
    @echo "✅ Stack listo"
    @echo "   API:      http://localhost:{{api_port}}/health"
    @echo "   Frontend: http://localhost:{{frontend_port}}"

# Comprueba que API y frontend respondan (útil tras setup o up).
health:
    #!/usr/bin/env bash
    set -euo pipefail
    compose_env="${COMPOSE_ENV:-dev}"
    api_ok=false
    front_ok=false
    for i in $(seq 1 30); do
      if curl -sf "http://localhost:{{api_port}}/health" >/dev/null 2>&1; then
        api_ok=true
        break
      fi
      sleep 2
    done
    for i in $(seq 1 30); do
      if curl -sf -o /dev/null "http://localhost:{{frontend_port}}/" 2>&1; then
        front_ok=true
        break
      fi
      sleep 2
    done
    if ! $api_ok; then
      echo "❌ API no respondió en http://localhost:{{api_port}}/health" >&2
      exit 1
    fi
    if ! $front_ok; then
      echo "❌ Frontend no respondió en http://localhost:{{frontend_port}}" >&2
      exit 1
    fi
    echo "✅ API OK — http://localhost:{{api_port}}/health"
    echo "✅ Frontend OK — http://localhost:{{frontend_port}}"
    if [[ "$compose_env" == "prod" ]]; then
      if curl -sf "http://localhost:{{frontend_port}}/health" >/dev/null 2>&1; then
        echo "✅ Proxy Nginx /health OK"
      else
        echo "⚠️  Proxy Nginx /health no respondió (revisa deploy/nginx/frontend.conf)" >&2
      fi
    fi

# Abre una shell bash dentro del contenedor api.
shell-api: _check
    {{compose}} exec api bash

# Abre una shell bash dentro del contenedor frontend.
shell-frontend: _check
    {{compose}} exec frontend sh

# Estado de contenedores del proyecto.
status: env-info
    {{compose}} ps
    @echo ""
    @podman images | grep {{project}} || true

# Levanta contenedores en segundo plano.
up: env-info
    {{compose}} up -d
    @echo "🚀 API en http://localhost:{{api_port}}"
    @echo "🌐 Frontend en http://localhost:{{frontend_port}}"

# Levanta contenedores en primer plano (logs en la terminal).
up-logs: env-info
    {{compose}} up

# Espera a que PostgreSQL del contenedor db responda (hasta ~60 s).
wait-db: _check
    #!/usr/bin/env bash
    set -euo pipefail
    for i in $(seq 1 30); do
      if {{compose}} exec -T db pg_isready -U "${DB_USERNAME:-feromap}" -d "${DB_DATABASE:-feromap}" >/dev/null 2>&1; then
        echo "✅ PostgreSQL listo"
        exit 0
      fi
      sleep 2
    done
    echo "❌ PostgreSQL no respondió a tiempo"
    exit 1

[private]
_check:
    @{{compose}} config >/dev/null
