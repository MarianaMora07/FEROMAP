#!/usr/bin/env bash
# Restaura un backup custom de PostgreSQL.
# Uso: just restore backups/feromap-YYYYmmdd-HHMMSS.dump
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILE="${1:-}"
if [[ -z "${FILE}" || ! -f "${FILE}" ]]; then
  echo "❌ Uso: just restore <archivo.dump>" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

DB_USER="${DB_USERNAME:-feromap}"
DB_NAME="${DB_DATABASE:-feromap}"

echo "⚠️  Esto reemplaza el contenido actual de la base '${DB_NAME}'."
echo "▶ Restaurando ${FILE}…"
./scripts/compose.sh exec -T db pg_restore \
  -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$FILE"

echo "✅ Restauración completada desde ${FILE}"
