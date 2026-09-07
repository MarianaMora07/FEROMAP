import { expect, test, type Page } from '@playwright/test';
import { ensurePlannerSession } from './helpers/planner-session';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8000';
const ADMIN_EMAIL = 'admin@fero.com';
const ADMIN_PASSWORD = '123456789';

async function ensureAdminSession(page: Page) {
  const apiResponse = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(apiResponse.ok()).toBeTruthy();
  const body = (await apiResponse.json()) as { accessToken: string };
  await page.addInitScript((token: string) => {
    localStorage.setItem('feromap.auth.token', token);
  }, body.accessToken);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

test.describe('Badges demo/producto en el sidebar (Fase 5)', () => {
  test('admin ve badges demo en módulos de tesis', async ({ page }) => {
    await ensureAdminSession(page);
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });

    // Existen 3 chips demo (Simulación, Casos de estudio, Demostración) aunque el grupo esté colapsado.
    await expect(page.getByTestId('sidebar-kind-demo')).toHaveCount(3);
    await expect(page.getByTestId('sidebar-kind-producto')).not.toHaveCount(0);

    // Al expandir el grupo Tesis, el chip demo queda visible.
    await page.getByRole('button', { name: 'Tesis y demostración' }).click();
    await expect(page.getByTestId('sidebar-kind-demo').first()).toBeVisible();
  });

  test('planificador no ve badges (solo admin)', async ({ page }) => {
    await ensurePlannerSession(page, '/');
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('sidebar-kind-demo')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-kind-producto')).toHaveCount(0);
  });
});
