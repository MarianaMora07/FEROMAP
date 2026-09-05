#!/usr/bin/env bash
# Evidencia académica B5: 4 reportes + consolidado fase-b + tabla fase-12.
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

PYTHON="${ROOT}/backend/.venv/bin/python"
if [[ -x "$PYTHON" ]]; then
  cd "$ROOT/backend"
  exec "$PYTHON" -m scripts.generate_phase_b_evidence
fi

cd "$ROOT"
unset FEROMAP_REPO_ROOT
exec ./scripts/compose.sh exec -T api python -m scripts.generate_phase_b_evidence
