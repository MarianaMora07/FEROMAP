import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';

test.describe('Route playback — optimización', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('optimizar, reproducir recorrido y ver marcador del camión', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({
      timeout: 45_000,
    });

    // El día puede llegar ya optimizado (botón "Generar" oculto) o requerir generación.
    const generateButton = page.getByTestId('optimization-generate-route');
    if (await generateButton.isVisible()) {
      await generateButton.click();
    }
    // El detalle (rutas por vehículo) vive en su propia pestaña de primer nivel.
    await page.getByTestId('plan-day-tab-routes').click();
    await expect(page.getByTestId('optimization-routes-table')).toBeVisible({ timeout: 90_000 });

    // El botón "Simular" salió del toolbar; el playback se abre con el deep link ?playback=1.
    await page.goto('/optimization?playback=1', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('optimization-playback-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('route-playback-controls')).toBeVisible();
    await expect(page.getByTestId('route-playback-clock')).toBeVisible();
    await expect(page.getByTestId('route-playback-legend')).toBeVisible();

    await page.getByTestId('route-playback-speed-2x').click();
    await page.getByRole('button', { name: 'Reproducir' }).click();

    await expect(page.locator('[data-testid="route-playback-truck-marker"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('deep link playback=1 abre panel con controles', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    // El día puede llegar ya optimizado (botón "Generar" oculto) o requerir generación.
    const generateButton = page.getByTestId('optimization-generate-route');
    if (await generateButton.isVisible()) {
      await generateButton.click();
    }
    // El detalle (rutas por vehículo) vive en su propia pestaña de primer nivel.
    await page.getByTestId('plan-day-tab-routes').click();
    await expect(page.getByTestId('optimization-routes-table')).toBeVisible({ timeout: 90_000 });

    await page.goto('/optimization?playback=1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('optimization-playback-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('route-playback-speed-4x')).toBeVisible();
  });
});
