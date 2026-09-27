#!/usr/bin/env bash
# Fase A — Día 0: verificación rápida de entorno (API, login demo, caso CE-UNARE-NORTE).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${E2E_API_URL:-http://localhost:8000}"
FRONTEND_URL="${E2E_WEB_URL:-http://localhost:5173}"

pass() { printf '  ✓ %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; exit 1; }

echo "FEROMAP — Fase A smoke (Día 0)"
echo "API:      $API_URL"
echo "Frontend: $FRONTEND_URL"
echo

# 1. Health API
health_code="$(curl -s -o /tmp/feromap-health.json -w '%{http_code}' "$API_URL/health" || true)"
if [[ "$health_code" != "200" ]]; then
  fail "API no responde en $API_URL/health (HTTP $health_code). Ejecuta: just up"
fi
pass "API /health OK"

# 2. Frontend (opcional si Vite está levantado)
frontend_code="$(curl -s -o /dev/null -w '%{http_code}' "$FRONTEND_URL" || true)"
if [[ "$frontend_code" == "200" ]]; then
  pass "Frontend accesible en $FRONTEND_URL"
else
  printf '  ~ Frontend no detectado en %s (HTTP %s) — opcional para tests API\n' "$FRONTEND_URL" "$frontend_code"
fi

# 3. Login demo (planificador, conductor, residente)
check_login() {
  local email="$1"
  local label="$2"
  local code
  code="$(curl -s -o /tmp/feromap-login.json -w '%{http_code}' \
    -X POST "$API_URL/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"123456789\"}")"
  if [[ "$code" != "200" ]]; then
    fail "Login $label falló ($email) — ¿just seed?"
  fi
  pass "Login $label ($email)"
}

check_login "plan@fero.com" "planificador"
PLAN_TOKEN="$(python3 -c "import json; print(json.load(open('/tmp/feromap-login.json'))['accessToken'])")"
check_login "conductor@fero.com" "conductor"
check_login "residente@fero.com" "residente"

# 4. Caso CE-UNARE-NORTE (token del planificador)
case_code="$(curl -s \
  -H "Authorization: Bearer $PLAN_TOKEN" \
  "$API_URL/api/v1/case-studies?limit=50" | python3 -c "
import json, sys
items = json.load(sys.stdin).get('items', [])
match = next((row for row in items if row.get('code') == 'CE-UNARE-NORTE'), None)
if not match:
    raise SystemExit(1)
print(match['code'])
" 2>/dev/null || true)"

if [[ -z "$case_code" ]]; then
  fail "No se encontró caso CE-UNARE-NORTE. Ejecuta: just seed"
fi
pass "Caso de estudio $case_code disponible"

echo
echo "Smoke OK. Siguiente paso:"
echo "  just phase-a-flow     # flujo completo (ACO real, ~2–3 min)"
echo "  npm run test:e2e -- e2e/phase-a-smoke.spec.ts"
