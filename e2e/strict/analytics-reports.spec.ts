import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from '../helpers/planner-session';

/**
 * F6: analítica y reportes consumen el API real (sin banner de mock) y no
 * rompen; si el API falla, muestran un error honesto.
 */
test.describe('Analítica y reportes (API real)', () => {
  test('analítica carga desde el API', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/analytics');
    await expect(page.getByTestId('analytics-page')).toBeVisible();
    await expect(page.getByTestId('analytics-error')).toHaveCount(0);
  });

  test('analítica muestra error honesto si el API cae', async ({ page }) => {
    await ensurePlannerSession(page, '/analytics');
    await page.route('**/api/v1/analytics/**', (route) =>
      route.fulfill({ status: 503, json: { detail: 'API no disponible' } }),
    );
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('analytics-error')).toBeVisible();
  });

  test('reportes carga desde el API', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/reports');
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await expect(page.getByTestId('reports-error')).toHaveCount(0);
  });

  test('reportes muestra error honesto si el API cae', async ({ page }) => {
    await ensurePlannerSession(page, '/reports');
    await page.route('**/api/v1/reports/summary*', (route) => route.abort());
    await page.goto('/reports', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('reports-error')).toBeVisible();
  });
});
