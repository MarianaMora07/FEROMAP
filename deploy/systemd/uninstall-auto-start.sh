#!/usr/bin/env bash
# Desinstala arranque automático FEROMAP.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta con sudo: sudo bash deploy/systemd/uninstall-auto-start.sh" >&2
  exit 1
fi

systemctl stop feroomap.service 2>/dev/null || true
systemctl disable feroomap.service 2>/dev/null || true
rm -f /etc/systemd/system/feromap.service
rm -f /etc/default/feromap
systemctl daemon-reload
echo "✅ feroomap.service desinstalado"
