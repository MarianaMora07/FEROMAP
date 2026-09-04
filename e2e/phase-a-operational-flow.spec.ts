import { expect, test } from '@playwright/test';

import { ensureOperatorSession, expectNoPageErrors, OPERATOR_EMAIL, OPERATOR_PASSWORD } from './helpers/operator-session';
import { API_URL, ensurePlannerSession, PLAN_EMAIL, PLAN_PASSWORD } from './helpers/planner-session';
import { RESIDENT_EMAIL, RESIDENT_PASSWORD } from './helpers/resident-session';
import { runPhaseAFlowViaApi } from './helpers/phase-a-flow';

async function ensureRealSession(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  landingPath: string,
  roleButton?: string,
) {
  const login = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  if (login.ok()) {
    const body = (await login.json()) as { accessToken: string };
    await page.addInitScript((token: string) => {
      localStorage.setItem('feromap.auth.token', token);
    }, body.accessToken);
  }

  await page.goto(landingPath, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) {
    if (roleButton) {
      await page.getByRole('button', { name: roleButton }).click();
    }
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname.startsWith(landingPath.split('?')[0]!), {
      timeout: 20_000,
    });
  }
}

test.describe('Fase A — flujo API CE-UNARE-NORTE', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test('ejecuta ciclo semana → día → despacho → conductor/residente', async ({ request }) => {
    const listRes = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: PLAN_EMAIL, password: PLAN_PASSWORD },
    });
    expect(listRes.ok()).toBeTruthy();
    const { accessToken } = (await listRes.json()) as { accessToken: string };
    const monday = (() => {
      const date = new Date();
      const day = date.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      date.setDate(date.getDate() + diff);
      return date.toISOString().slice(0, 10);
    })();
    const weeklyRes = await request.get(`${API_URL}/api/v1/planning/weekly`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const weeklyBody = (await weeklyRes.json()) as {
      items: Array<{ weekStartDate: string; status: string }>;
    };
    const current = weeklyBody.items.find((plan) => plan.weekStartDate === monday);
    if (current?.status === 'approved') {
      test.skip(
        true,
        'Plan semanal aprobado del seed bloquea el flujo API. Ejecuta primero: just phase-a-flow',
      );
    }

    const result = await runPhaseAFlowViaApi(request);
    expect(result.operatorStops).toBeGreaterThan(0);
    expect(result.residentHasWeeklyPlan).toBe(true);
  });
});

test.describe('Fase A — UI tras flujo (requiere just phase-a-flow)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  test.beforeAll(async ({ request }) => {
    const operatorRes = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD },
    });
    expect(operatorRes.ok()).toBeTruthy();
    const { accessToken } = (await operatorRes.json()) as { accessToken: string };
    const today = new Date().toISOString().slice(0, 10);
    const snapshotRes = await request.get(
      `${API_URL}/api/v1/planning/operator-snapshot?operationDate=${today}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!snapshotRes.ok()) {
      test.skip(true, 'Sin snapshot de operador. Ejecuta: just phase-a-flow');
      return;
    }
    const snapshot = (await snapshotRes.json()) as { dailyPlanStatus: string | null; stopsTotal: number };
    if (snapshot.dailyPlanStatus !== 'dispatched' || snapshot.stopsTotal < 1) {
      test.skip(true, 'Plan del día no despachado. Ejecuta: just phase-a-flow');
    }
  });

  test('conductor ve plan despachado en /operator/plan', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureRealSession(page, OPERATOR_EMAIL, OPERATOR_PASSWORD, '/operator/plan', 'Conductor');
    await expect(page.getByTestId('operator-daily-plan')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('operator-stops-stepper')).toBeVisible({ timeout: 30_000 });
  });

  test('residente ve horario semanal en /resident', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureRealSession(page, RESIDENT_EMAIL, RESIDENT_PASSWORD, '/resident', 'Residente');
    await expect(page.getByText(/Horario de recolección|recolección/i).first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('planificador ve hub operativo en /planning', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/planning');
    await expect(page.getByTestId('planner-hub')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Mi planificación')).toBeVisible();
  });
});
