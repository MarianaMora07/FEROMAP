#!/usr/bin/env bash
# Reporte de optimización acotado a un caso de estudio (Fase 12.7).
# Uso: ./scripts/case-study-report.sh CE-UNARE-NORTE
#      just case-study-report CE-UNARE-NORTE
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' "$ROOT/.env" | grep -E '^(DB_|DATABASE_)')
  set +a
fi

export DATA_DIR="$ROOT/data"
export FEROMAP_REPO_ROOT="$ROOT"

if [[ "${DB_HOST:-db}" == "db" ]]; then
  export DB_HOST=127.0.0.1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql+psycopg://${DB_USERNAME:-feromap}:${DB_PASSWORD:-feromap}@${DB_HOST}:${DB_PORT:-5432}/${DB_DATABASE:-feromap}"
elif [[ "$DATABASE_URL" == *"@db:"* ]]; then
  export DATABASE_URL="${DATABASE_URL/@db:/@127.0.0.1:}"
fi

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <CODIGO-CASO> [--scenario normal|rain|saturated]" >&2
  exit 1
fi

if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
  PYTHON="$ROOT/backend/.venv/bin/python"
  cd "$ROOT/backend"
  exec "$PYTHON" -m scripts.case_study_report "$@"
fi

cd "$ROOT"
exec ./scripts/compose.sh exec -T api python -m scripts.case_study_report "$@"
