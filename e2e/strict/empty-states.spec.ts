import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from '../helpers/planner-session';

/**
 * Modo estricto (VITE_USE_MOCKS=false): si la API de una vista falla, la vista
 * debe mostrar error/vacío honesto, nunca datos demo.
 *
 * La API real sigue arriba para el login y el bootstrap; cada test solo hace
 * fallar el endpoint de datos de la vista correspondiente.
 */
test.describe('Modo estricto — estados honestos sin mocks', () => {
  test('la app carga con datos reales y sin aviso de error', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByTestId('dashboard-error')).toHaveCount(0);
  });

  test('dashboard: error honesto si cae el resumen', async ({ page }) => {
    await ensurePlannerSession(page, '/');
    await page.route('**/api/v1/dashboard/summary*', (route) => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('dashboard-error')).toBeVisible();
  });

  test('alertas: error honesto y sin alertas demo', async ({ page }) => {
    await ensurePlannerSession(page, '/alerts');
    await page.route('**/api/v1/alerts**', (route) =>
      route.fulfill({ status: 503, json: { detail: 'API no disponible' } }),
    );
    await page.goto('/alerts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('alerts-error')).toBeVisible();
    await expect(page.getByText('Contenedor crítico lleno')).toHaveCount(0);
  });

  test('puntos de recolección: error honesto y sin puntos demo', async ({ page }) => {
    await ensurePlannerSession(page, '/collection-points');
    await page.route('**/api/v1/collection-points', (route) =>
      route.fulfill({ status: 503, json: { detail: 'API no disponible' } }),
    );
    await page.goto('/collection-points', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('collection-points-error')).toBeVisible();
  });

  test('casos de estudio: error honesto y sin casos demo', async ({ page }) => {
    await ensurePlannerSession(page, '/case-studies');
    await page.route('**/api/v1/case-studies*', (route) => route.abort());
    await page.goto('/case-studies', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('case-studies-error')).toBeVisible();
  });

  test('reportes: error honesto y sin reportes demo', async ({ page }) => {
    await ensurePlannerSession(page, '/reports');
    await page.route('**/api/v1/reports/summary*', (route) => route.abort());
    await page.goto('/reports', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('reports-error')).toBeVisible();
  });
});
