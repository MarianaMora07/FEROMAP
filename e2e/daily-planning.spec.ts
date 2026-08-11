import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8000';
const PLAN_EMAIL = 'plan@fero.com';
const PLAN_PASSWORD = '123456789';

async function ensurePlannerSession(page: Page) {
  const apiResponse = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: PLAN_EMAIL, password: PLAN_PASSWORD },
  });

  if (apiResponse.ok()) {
    const body = (await apiResponse.json()) as { accessToken: string };
    await page.addInitScript((token: string) => {
      localStorage.setItem('feromap.auth.token', token);
    }, body.accessToken);
  }

  await page.goto('/optimization');

  if (page.url().includes('/login')) {
    await page.getByRole('button', { name: 'Planificador' }).click();
    await page.getByLabel('Contraseña').fill(PLAN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL('**/optimization**', { timeout: 20_000 });
  }

  await expect(page.getByText('Plan del día')).toBeVisible({ timeout: 45_000 });
}

test.describe('Planificación operativa — plan del día', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (error) => {
      throw new Error(`Error en la página: ${error.message}`);
    });
    await ensurePlannerSession(page);
  });

  test('muestra plan del día y acciones administrativas', async ({ page }) => {
    await expect(page.getByText('pendientes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actualizar pendientes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar día' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar ruta operativa' })).toBeVisible();
  });
});
