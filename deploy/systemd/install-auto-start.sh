#!/usr/bin/env bash
# Instala la unidad systemd feroomap.service para arranque automático al boot.
# Ejecutar en la EC2 (Debian 13): sudo bash deploy/systemd/install-auto-start.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta con sudo: sudo bash deploy/systemd/install-auto-start.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FEROMAP_USER="${FEROMAP_USER:-${SUDO_USER:-$(logname 2>/dev/null || echo root)}}"
FEROMAP_GROUP="${FEROMAP_GROUP:-$(id -gn "$FEROMAP_USER")}"
FEROMAP_ROOT="${FEROMAP_ROOT:-$REPO_ROOT}"
FEROMAP_UID="$(id -u "$FEROMAP_USER")"

UNIT_SRC="$SCRIPT_DIR/feromap.service"
UNIT_DST="/etc/systemd/system/feromap.service"
ENV_DST="/etc/default/feromap"

if [[ ! -f "$UNIT_SRC" ]]; then
  echo "ERROR: no existe plantilla $UNIT_SRC" >&2
  exit 1
fi

if [[ ! -f "$FEROMAP_ROOT/.env" ]]; then
  echo "ADVERTENCIA: no existe $FEROMAP_ROOT/.env" >&2
  echo "Crea .env antes del primer boot (cp .env.ec2.example .env && just setup-prod)" >&2
fi

if [[ ! -x "$FEROMAP_ROOT/scripts/boot-stack.sh" ]]; then
  chmod +x "$FEROMAP_ROOT/scripts/boot-stack.sh"
fi
chmod +x "$FEROMAP_ROOT/scripts/compose.sh"

if command -v loginctl >/dev/null 2>&1 && [[ "$FEROMAP_USER" != "root" ]]; then
  loginctl enable-linger "$FEROMAP_USER" 2>/dev/null || true
  echo "✓ loginctl enable-linger $FEROMAP_USER"
fi

tmp_unit="$(mktemp)"
trap 'rm -f "$tmp_unit"' EXIT

sed \
  -e "s|__FEROMAP_USER__|${FEROMAP_USER}|g" \
  -e "s|__FEROMAP_GROUP__|${FEROMAP_GROUP}|g" \
  -e "s|__FEROMAP_ROOT__|${FEROMAP_ROOT}|g" \
  -e "s|__FEROMAP_UID__|${FEROMAP_UID}|g" \
  "$UNIT_SRC" >"$tmp_unit"

if grep -q '__FEROMAP_' "$tmp_unit"; then
  echo "ERROR: quedaron placeholders sin sustituir en la unidad systemd" >&2
  grep '__FEROMAP_' "$tmp_unit" >&2 || true
  exit 1
fi

install -m 644 "$tmp_unit" "$UNIT_DST"
echo "✓ unidad escrita en $UNIT_DST"

cat >"$ENV_DST" <<EOF
# Configuración arranque automático FEROMAP — /etc/default/feromap
FEROMAP_ROOT=${FEROMAP_ROOT}
COMPOSE_ENV=prod
# BOOT_SKIP_MIGRATE=1
# BOOT_RUNTIME_WAIT_ATTEMPTS=30
EOF
chmod 644 "$ENV_DST"
echo "✓ entorno en $ENV_DST"

if ! systemctl daemon-reload; then
  echo "ERROR: systemctl daemon-reload falló" >&2
  exit 1
fi

if ! systemctl cat feroomap.service >/dev/null 2>&1; then
  echo "ERROR: systemd no cargó feroomap.service. Contenido instalado:" >&2
  cat "$UNIT_DST" >&2
  exit 1
fi

if ! systemctl enable feroomap.service; then
  echo "ERROR: systemctl enable feroomap.service falló" >&2
  echo "Diagnóstico:" >&2
  ls -la "$UNIT_DST" >&2 || true
  systemctl list-unit-files 'feromap.service' 2>&1 || true
  exit 1
fi

echo ""
echo "✅ Instalado: $UNIT_DST"
echo "   Usuario:  $FEROMAP_USER (uid=$FEROMAP_UID)"
echo "   Proyecto: $FEROMAP_ROOT"
echo ""
echo "Comandos:"
echo "  sudo systemctl start feroomap"
echo "  sudo systemctl status feroomap"
echo "  journalctl -u feroomap -b -n 80"
echo ""
echo "Desinstalar: sudo bash $SCRIPT_DIR/uninstall-auto-start.sh"
