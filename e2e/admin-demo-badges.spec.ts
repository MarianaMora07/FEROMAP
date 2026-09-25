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
  test('los módulos de tesis no se listan (sin chips demo) pero el chip producto sigue', async ({
    page,
  }) => {
    await ensureAdminSession(page);
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });

    // El grupo Tesis y demostración está oculto del sidebar (`DEMO_NAV_HIDDEN_HREFS`),
    // así que no hay grupo que expandir ni chips demo que mostrar.
    await expect(page.getByRole('button', { name: 'Tesis y demostración' })).toHaveCount(0);
    await expect(page.getByTestId('sidebar-kind-demo')).toHaveCount(0);
    // Los módulos de producto siguen mostrando su chip para el admin.
    await expect(page.getByTestId('sidebar-kind-producto')).not.toHaveCount(0);
  });

  test('planificador no ve badges (solo admin)', async ({ page }) => {
    await ensurePlannerSession(page, '/');
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('sidebar-kind-demo')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-kind-producto')).toHaveCount(0);
  });
});
