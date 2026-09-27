#!/usr/bin/env bash
# Atajo: optimización real contra PostgreSQL + tabla de planes por conductor.
# Uso: ./scripts/optimization-driver-report.sh [escenario]
#      ./scripts/optimization-driver-report.sh --case-study CE-UNARE-NORTE
#      just optimization-driver-report normal
#      just optimization-driver-report --case-study CE-UNARE-NORTE
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' "$ROOT/.env" | grep -E '^(DB_|DATABASE_)')
  set +a
fi

export DATA_DIR="$ROOT/data"

# Desde el host, el servicio compose se expone en localhost
if [[ "${DB_HOST:-db}" == "db" ]]; then
  export DB_HOST=127.0.0.1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql+psycopg://${DB_USERNAME:-feromap}:${DB_PASSWORD:-feromap}@${DB_HOST}:${DB_PORT:-5432}/${DB_DATABASE:-feromap}"
elif [[ "$DATABASE_URL" == *"@db:"* ]]; then
  export DATABASE_URL="${DATABASE_URL/@db:/@127.0.0.1:}"
fi

PYTHON="${ROOT}/backend/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo "ERROR: no existe $PYTHON — crea el venv del backend o ejecuta dentro del contenedor api." >&2
  exit 1
fi

cd "$ROOT/backend"
exec "$PYTHON" -m scripts.optimization_driver_plan_report "$@"
