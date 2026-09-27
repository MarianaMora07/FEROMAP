#!/usr/bin/env bash
# Backup de PostgreSQL en formato custom, con retención de las N copias más recientes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

DB_USER="${DB_USERNAME:-feromap}"
DB_NAME="${DB_DATABASE:-feromap}"
KEEP="${BACKUP_KEEP:-14}"
DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${DIR}/feromap-${STAMP}.dump"

mkdir -p "$DIR"

echo "▶ Backup de ${DB_NAME} → ${FILE}"
# -Fc (custom): comprimido y restaurable con pg_restore.
./scripts/compose.sh exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$FILE"

echo "▶ Retención: conservando las ${KEEP} copias más recientes"
ls -1t "${DIR}"/feromap-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "✅ Backup completado: ${FILE}"
