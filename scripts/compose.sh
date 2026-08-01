#!/usr/bin/env bash
# Combina compose.yml + compose.${COMPOSE_ENV}.yml (dev | prod desde .env).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cli_compose_set=false
if [[ -v COMPOSE_ENV ]]; then
  cli_compose="$COMPOSE_ENV"
  cli_compose_set=true
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

if $cli_compose_set; then
  COMPOSE_ENV="$cli_compose"
fi
COMPOSE_ENV="${COMPOSE_ENV:-dev}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-feromap}"

case "$COMPOSE_ENV" in
  dev|prod) ;;
  *)
    echo "COMPOSE_ENV debe ser 'dev' o 'prod' (actual: ${COMPOSE_ENV})" >&2
    exit 1
    ;;
esac

if [[ ! -f .env ]]; then
  echo "No hay .env en la raíz del proyecto." >&2
  echo "Copia la plantilla: cp .env.example .env" >&2
  exit 1
fi

if [[ "$COMPOSE_ENV" == "dev" && "${APP_ENV:-}" == "production" ]]; then
  echo "COMPOSE_ENV=dev pero APP_ENV=production en .env (recomendado: APP_ENV=local)" >&2
elif [[ "$COMPOSE_ENV" == "prod" && "${APP_ENV:-}" == "local" ]]; then
  echo "COMPOSE_ENV=prod pero APP_ENV=local en .env (recomendado: APP_ENV=production)" >&2
fi

if [[ -z "${DB_PASSWORD:-}" ]]; then
  echo "DB_PASSWORD está vacío en .env" >&2
  exit 1
fi

files=(-f compose.yml -f "compose.${COMPOSE_ENV}.yml")

if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  exec podman compose "${files[@]}" "$@"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  exec docker compose "${files[@]}" "$@"
fi

if command -v podman-compose >/dev/null 2>&1; then
  exec podman-compose "${files[@]}" "$@"
fi

echo "No se encontró podman compose, docker compose ni podman-compose." >&2
exit 1
