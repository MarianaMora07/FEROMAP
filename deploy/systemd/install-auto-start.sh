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

# Usuario que posee el repo y ejecutará compose (no root salvo que despliegues así)
FEROMAP_USER="${FEROMAP_USER:-${SUDO_USER:-$(logname 2>/dev/null || echo root)}}"
FEROMAP_GROUP="${FEROMAP_GROUP:-$(id -gn "$FEROMAP_USER")}"
FEROMAP_ROOT="${FEROMAP_ROOT:-$REPO_ROOT}"
FEROMAP_UID="$(id -u "$FEROMAP_USER")"

UNIT_SRC="$SCRIPT_DIR/feromap.service"
UNIT_DST="/etc/systemd/system/feromap.service"
ENV_DST="/etc/default/feromap"

if [[ ! -f "$FEROMAP_ROOT/.env" ]]; then
  echo "ADVERTENCIA: no existe $FEROMAP_ROOT/.env" >&2
  echo "Crea .env antes del primer boot (cp .env.ec2.example .env && just setup-prod)" >&2
fi

if [[ ! -x "$FEROMAP_ROOT/scripts/boot-stack.sh" ]]; then
  chmod +x "$FEROMAP_ROOT/scripts/boot-stack.sh"
fi
chmod +x "$FEROMAP_ROOT/scripts/compose.sh"

# Rootless Podman: permite que servicios del usuario sobrevivan sin sesión SSH
if command -v loginctl >/dev/null 2>&1 && [[ "$FEROMAP_USER" != "root" ]]; then
  loginctl enable-linger "$FEROMAP_USER" 2>/dev/null || true
  echo "✓ loginctl enable-linger $FEROMAP_USER"
fi

sed \
  -e "s|__FEROMAP_USER__|${FEROMAP_USER}|g" \
  -e "s|__FEROMAP_GROUP__|${FEROMAP_GROUP}|g" \
  -e "s|__FEROMAP_ROOT__|${FEROMAP_ROOT}|g" \
  -e "s|__FEROMAP_UID__|${FEROMAP_UID}|g" \
  "$UNIT_SRC" >"$UNIT_DST"

cat >"$ENV_DST" <<EOF
# Configuración arranque automático FEROMAP — /etc/default/feromap
FEROMAP_ROOT=${FEROMAP_ROOT}
COMPOSE_ENV=prod
# BOOT_SKIP_MIGRATE=1
# BOOT_RUNTIME_WAIT_ATTEMPTS=30
EOF
chmod 644 "$ENV_DST"

systemctl daemon-reload
systemctl enable feroomap.service

echo ""
echo "✅ Instalado: $UNIT_DST"
echo "   Usuario:  $FEROMAP_USER (uid=$FEROMAP_UID)"
echo "   Proyecto: $FEROMAP_ROOT"
echo ""
echo "Comandos:"
echo "  sudo systemctl start feroomap    # probar arranque ahora"
echo "  sudo systemctl status feroomap"
echo "  journalctl -u feroomap -b -n 80"
echo ""
echo "Desinstalar: sudo bash $SCRIPT_DIR/uninstall-auto-start.sh"
