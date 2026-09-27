#!/usr/bin/env bash
# Verificación de producción: defense-verify + observabilidad (F3).
# Requiere el stack de producción levantado (COMPOSE_ENV=prod).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
API_BASE="http://localhost:${API_PORT}"
FRONT_BASE="http://localhost:${FRONTEND_PORT}"

echo "═══════════════════════════════════════════"
echo " FEROMAP — verificación de producción"
echo " API:${API_PORT}  UI:${FRONTEND_PORT}"
echo "═══════════════════════════════════════════"

echo ""
echo "▶ 1/3 Regresión funcional (defense-verify sobre prod)…"
COMPOSE_ENV=prod bash ./scripts/defense-verify.sh

echo ""
echo "▶ 2/3 Observabilidad: /metrics expone latencia y tasa de error…"
metrics="$(curl -sf "${API_BASE}/metrics")"
if ! grep -q "feromap_http_requests_total" <<<"${metrics}"; then
  echo "❌ /metrics no expone feromap_http_requests_total" >&2
  exit 1
fi
if ! grep -q "feromap_http_request_duration_seconds" <<<"${metrics}"; then
  echo "❌ /metrics no expone la latencia (histograma)" >&2
  exit 1
fi
echo "   ✅ /metrics con latencia y conteo por estado"

echo ""
echo "▶ 3/3 Correlación por request-id…"
rid="$(curl -si "${API_BASE}/health" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')"
if [[ -z "${rid}" ]]; then
  echo "❌ La API no devuelve X-Request-ID" >&2
  exit 1
fi
echo "   ✅ X-Request-ID=${rid}"

echo ""
echo "═══════════════════════════════════════════"
echo " ✅ Verificación de producción completada"
echo "   UI:  ${FRONT_BASE}"
echo "   API: ${API_BASE}/health   Métricas: ${API_BASE}/metrics"
echo "═══════════════════════════════════════════"
