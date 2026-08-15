#!/usr/bin/env bash
# Verificación pre-defensa: health, autenticación, optimización y (prod) proxy Nginx.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed 's/\r$//' .env)
  set +a
fi

COMPOSE_ENV="${COMPOSE_ENV:-dev}"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
API_BASE="http://localhost:${API_PORT}"
FRONT_BASE="http://localhost:${FRONTEND_PORT}"

DEMO_EMAIL="${DEMO_EMAIL:-plan@fero.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-123456789}"

echo "═══════════════════════════════════════════"
echo " FEROMAP — verificación pre-defensa"
echo " Entorno: ${COMPOSE_ENV}  API:${API_PORT}  UI:${FRONTEND_PORT}"
echo "═══════════════════════════════════════════"

echo ""
echo "▶ 1/7 Health check (just health)…"
just health

echo ""
echo "▶ 2/7 Autenticación (${DEMO_EMAIL})…"
login_json="$(curl -sf -X POST "${API_BASE}/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}")"
TOKEN="$(echo "${login_json}" | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")"
ROLE="$(echo "${login_json}" | python -c "import sys,json; print(json.load(sys.stdin)['user']['role'])")"
echo "   ✅ Login OK (rol: ${ROLE})"

echo ""
echo "▶ 3/7 Datos GIS (sectores y contenedores)…"
sectors_count="$(curl -sf "${API_BASE}/api/v1/sectors" | python -c "import sys,json; print(len(json.load(sys.stdin).get('features',[])))")"
points_count="$(curl -sf "${API_BASE}/api/v1/collection-points" | python -c "import sys,json; print(len(json.load(sys.stdin).get('features',[])))")"
if [[ "${sectors_count}" -lt 1 || "${points_count}" -lt 1 ]]; then
  echo "❌ Datos insuficientes (sectores=${sectors_count}, puntos=${points_count}). Ejecuta: just seed" >&2
  exit 1
fi
echo "   ✅ ${sectors_count} sectores, ${points_count} contenedores"

echo ""
echo "▶ 4/7 Optimización ACO (POST /simulations/optimize → job)…"
job_json="$(curl -sf -X POST "${API_BASE}/api/v1/simulations/optimize" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"normal"}')"
job_id="$(echo "${job_json}" | python -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))")"
if [[ -z "${job_id}" ]]; then
  echo "❌ Optimización no devolvió jobId" >&2
  exit 1
fi
optimize_json=""
deadline=$((SECONDS + 120))
while [[ "${SECONDS}" -lt "${deadline}" ]]; do
  optimize_json="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_BASE}/api/v1/simulations/jobs/${job_id}")"
  status="$(echo "${optimize_json}" | python -c "import sys,json; print(json.load(sys.stdin).get('status',''))")"
  if [[ "${status}" == "completed" ]]; then
    break
  fi
  if [[ "${status}" == "failed" || "${status}" == "cancelled" ]]; then
    echo "❌ Job terminó con status=${status}" >&2
    exit 1
  fi
  sleep 1
done
sim_id="$(echo "${optimize_json}" | python -c "
import sys, json
d = json.load(sys.stdin)
result = d.get('result') or {}
print(result.get('simulationId',''))
")"
saving="$(echo "${optimize_json}" | python -c "
import sys, json
d = json.load(sys.stdin)
result = d.get('result') or {}
kpis = result.get('kpis') or {}
dist = kpis.get('distanceKm') or {}
print(dist.get('savingPct', result.get('savingPercentage', '?')))
")"
if [[ -z "${sim_id}" ]]; then
  echo "❌ Optimización no devolvió simulationId" >&2
  exit 1
fi
echo "   ✅ simulationId=${sim_id}  ahorro≈${saving}%"

echo ""
echo "▶ 5/7 Rutas y dashboard…"
curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_BASE}/api/v1/routes/optimized" >/dev/null
curl -sf "${API_BASE}/api/v1/dashboard/summary" >/dev/null
curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_BASE}/api/v1/reports/summary" >/dev/null
echo "   ✅ Rutas optimizadas, dashboard y reportes"

echo ""
echo "▶ 6/7 Detalle de simulación #${sim_id}…"
curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_BASE}/api/v1/simulations/${sim_id}" >/dev/null
echo "   ✅ GET /simulations/${sim_id}"

if [[ "${COMPOSE_ENV}" == "prod" ]]; then
  echo ""
  echo "▶ 7/7 Proxy Nginx (SPA + /api)…"
  curl -sf "${FRONT_BASE}/" >/dev/null
  curl -sf "${FRONT_BASE}/health" >/dev/null
  nginx_opt="$(curl -sf -X POST "${FRONT_BASE}/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}" | python -c "import sys,json; print('ok' if json.load(sys.stdin).get('accessToken') else 'fail')")"
  if [[ "${nginx_opt}" != "ok" ]]; then
    echo "❌ Login vía Nginx /api falló" >&2
    exit 1
  fi
  echo "   ✅ UI en ${FRONT_BASE} y proxy /api operativo"
else
  echo ""
  echo "▶ 7/7 Modo dev — omitiendo proxy Nginx (usa COMPOSE_ENV=prod para probarlo)"
fi

echo ""
echo "═══════════════════════════════════════════"
echo " ✅ Verificación pre-defensa completada"
echo "   UI:  ${FRONT_BASE}"
echo "   API: ${API_BASE}/health"
echo "   Demo: / → Nueva simulación → /simulation → Ejecutar → Analítica/Reportes"
echo "═══════════════════════════════════════════"
