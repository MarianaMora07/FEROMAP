import { expect, test } from '@playwright/test';

import { API_URL, PLAN_EMAIL, PLAN_PASSWORD } from './helpers/planner-session';
import { CASE_STUDY_CODE } from './helpers/phase-a-flow';

test.describe('Fase A — Día 0 smoke', () => {
  test('API health y credenciales demo', async ({ request }) => {
    const health = await request.get(`${API_URL}/health`);
    expect(health.ok()).toBeTruthy();
    const healthBody = await health.json();
    expect(healthBody.status).toBe('ok');

    for (const [email, role] of [
      [PLAN_EMAIL, 'planificador'],
      ['conductor@fero.com', 'conductor'],
      ['residente@fero.com', 'residente'],
    ] as const) {
      const login = await request.post(`${API_URL}/api/v1/auth/login`, {
        data: { email, password: PLAN_PASSWORD },
      });
      expect(login.ok(), `Login ${role} falló`).toBeTruthy();
      const body = (await login.json()) as { accessToken: string; user: { role: string } };
      expect(body.accessToken.length).toBeGreaterThan(10);
      expect(body.user.role).toBe(role === 'planificador' ? 'planificador' : role);
    }
  });

  test('caso CE-UNARE-NORTE disponible en API', async ({ request }) => {
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: PLAN_EMAIL, password: PLAN_PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    const { accessToken } = (await login.json()) as { accessToken: string };

    const casesRes = await request.get(`${API_URL}/api/v1/case-studies?limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(casesRes.ok()).toBeTruthy();
    const body = (await casesRes.json()) as { items: Array<{ code: string; pointCount?: number }> };
    const match = body.items.find((row) => row.code === CASE_STUDY_CODE);
    expect(match, `Falta ${CASE_STUDY_CODE}. Ejecuta: just seed`).toBeTruthy();
  });
});
