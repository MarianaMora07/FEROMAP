#!/usr/bin/env bash
# Fase B — verificación automática (D25 extendido): Fase A + checks B1–B3.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pass() { printf '  ✓ %s\n' "$1"; }
step() { printf '\n── %s\n' "$1"; }

echo "FEROMAP — Fase B verify (D25)"
echo "Requiere: just up"
echo

step "0/4 Seed — estado limpio para integración"
just seed >/dev/null
pass "just seed OK"

step "1/4 Fase A — flujo operativo CE-UNARE-NORTE"
./scripts/compose.sh exec -T api pytest tests/test_phase_a_operational_flow.py -v -m phase_a
pass "phase-a-flow OK"

step "2/4 Fase B — backend (autofill, TR-01, residente, demo flags)"
./scripts/compose.sh exec -T api pytest \
  tests/test_phase_b_weekly_autofill.py \
  tests/test_phase_b_operator_resident.py \
  tests/test_phase_b_verify.py \
  -v -m phase_b
pass "phase-b pytest OK"

step "3/4 Fase B — UI smoke (menú planificador sin /analytics)"
npm test -- src/core/auth/permissions.test.ts
pass "permissions.test.ts OK"

echo
echo "Fase B verify completa."
echo "Opcional: just phase-b-evidence  # regenerar anexo 4 casos (D20–D21)"
