#!/usr/bin/env bash
# Arranque/parada del stack FEROMAP para systemd (EC2 stop/start, reboot).
# Uso manual: COMPOSE_ENV=prod ./scripts/boot-stack.sh start|stop|status|health
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ACTION="${1:-start}"
COMPOSE_ENV="${COMPOSE_ENV:-prod}"
export COMPOSE_ENV

log() {
  echo "[feromap-boot] $*"
}

wait_for_runtime() {
  local max_attempts="${BOOT_RUNTIME_WAIT_ATTEMPTS:-30}"
  local delay="${BOOT_RUNTIME_WAIT_SEC:-2}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if "$ROOT/scripts/compose.sh" version >/dev/null 2>&1; then
      log "Runtime de contenedores listo (intento ${attempt}/${max_attempts})"
      return 0
    fi
    log "Esperando runtime de contenedores (${attempt}/${max_attempts})…"
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  log "ERROR: runtime de contenedores no disponible tras ${max_attempts} intentos"
  return 1
}

wait_for_db() {
  local max_attempts="${BOOT_DB_WAIT_ATTEMPTS:-45}"
  local delay="${BOOT_DB_WAIT_SEC:-2}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if "$ROOT/scripts/compose.sh" exec -T db pg_isready \
      -U "${DB_USERNAME:-feromap}" \
      -d "${DB_DATABASE:-feromap}" >/dev/null 2>&1; then
      log "PostgreSQL listo"
      return 0
    fi
    log "Esperando PostgreSQL (${attempt}/${max_attempts})…"
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  log "ERROR: PostgreSQL no respondió a tiempo"
  return 1
}

run_migrate() {
  if [[ "${BOOT_SKIP_MIGRATE:-0}" == "1" ]]; then
    log "Migraciones omitidas (BOOT_SKIP_MIGRATE=1)"
    return 0
  fi
  log "Aplicando migraciones Alembic (idempotente)…"
  "$ROOT/scripts/compose.sh" exec -T api alembic upgrade head
}

check_health() {
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source <(sed 's/\r$//' "$ROOT/.env")
    set +a
  fi

  local api_port="${API_PORT:-8000}"
  local front_port="${FRONTEND_PORT:-8080}"
  local api_ok=false
  local front_ok=false
  local attempt

  for attempt in $(seq 1 "${BOOT_HEALTH_ATTEMPTS:-30}"); do
    if curl -sf "http://127.0.0.1:${api_port}/health" >/dev/null 2>&1; then
      api_ok=true
      break
    fi
    sleep "${BOOT_HEALTH_WAIT_SEC:-2}"
  done

  for attempt in $(seq 1 "${BOOT_HEALTH_ATTEMPTS:-30}"); do
    if curl -sf -o /dev/null "http://127.0.0.1:${front_port}/" 2>/dev/null \
      || curl -sf -o /dev/null "http://127.0.0.1:${front_port}/health" 2>/dev/null; then
      front_ok=true
      break
    fi
    sleep "${BOOT_HEALTH_WAIT_SEC:-2}"
  done

  if [[ "$api_ok" == true && "$front_ok" == true ]]; then
    log "Health OK — API :${api_port}/health · UI :${front_port}/"
    return 0
  fi

  log "ERROR: healthcheck falló (api=${api_ok}, frontend=${front_ok})"
  return 1
}

do_start() {
  if [[ ! -f "$ROOT/.env" ]]; then
    log "ERROR: falta $ROOT/.env (copia .env.ec2.example o .env.prod.example)"
    exit 1
  fi

  wait_for_runtime
  log "Levantando stack (COMPOSE_ENV=${COMPOSE_ENV})…"
  "$ROOT/scripts/compose.sh" up -d

  wait_for_db
  run_migrate
  check_health
  log "Stack iniciado correctamente"
}

do_stop() {
  if [[ -f "$ROOT/.env" ]]; then
    wait_for_runtime || true
    log "Deteniendo stack (conserva volúmenes)…"
    "$ROOT/scripts/compose.sh" stop || true
  else
    log "Sin .env — nada que detener"
  fi
}

do_status() {
  wait_for_runtime
  "$ROOT/scripts/compose.sh" ps
}

case "$ACTION" in
  start) do_start ;;
  stop) do_stop ;;
  status) do_status ;;
  health) check_health ;;
  *)
    echo "Uso: $0 {start|stop|status|health}" >&2
    exit 1
    ;;
esac
