#!/usr/bin/env bash
# Verifica el flujo mínimo de demo: API, datos GIS y optimización (con autenticación).
set -euo pipefail

API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
API_BASE="http://localhost:${API_PORT}"
DEMO_EMAIL="${DEMO_EMAIL:-plan@fero.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-123456789}"

echo "▶ Verificando salud del stack…"
just health

echo "▶ Autenticación…"
login_json="$(curl -sf -X POST "${API_BASE}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")"
TOKEN="$(echo "${login_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")"
echo "   ✅ Login OK"

echo "▶ Sectores (GeoJSON)…"
sectors_count="$(curl -sf "${API_BASE}/api/v1/sectors" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('features',[])))")"
if [[ "${sectors_count}" -lt 1 ]]; then
  echo "❌ Sin sectores en la API" >&2
  exit 1
fi
echo "   ✅ ${sectors_count} sectores"

echo "▶ Contenedores (GeoJSON)…"
points_count="$(curl -sf "${API_BASE}/api/v1/collection-points" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('features',[])))")"
if [[ "${points_count}" -lt 1 ]]; then
  echo "❌ Sin contenedores en la API" >&2
  exit 1
fi
echo "   ✅ ${points_count} contenedores"

echo "▶ Ruta actual…"
curl -sf "${API_BASE}/api/v1/routes/current" >/dev/null
echo "   ✅ GET /routes/current"

echo "▶ Optimización (escenario normal)…"
optimize_json="$(curl -sf -X POST "${API_BASE}/api/v1/simulations/optimize" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"normal"}')"
sim_id="$(echo "${optimize_json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('simulationId',''))")"
if [[ -z "${sim_id}" ]]; then
  echo "❌ Optimización no devolvió simulationId" >&2
  exit 1
fi
echo "   ✅ simulationId=${sim_id}"

echo "▶ Ruta optimizada…"
curl -sf "${API_BASE}/api/v1/routes/optimized" >/dev/null
echo "   ✅ GET /routes/optimized"

echo "▶ Dashboard…"
curl -sf "${API_BASE}/api/v1/dashboard/summary" >/dev/null
echo "   ✅ GET /dashboard/summary"

echo ""
echo "✅ Demo verificada"
echo "   Frontend: http://localhost:${FRONTEND_PORT}"
echo "   Flujo: /map → /simulation → Optimizar → /dashboard"
