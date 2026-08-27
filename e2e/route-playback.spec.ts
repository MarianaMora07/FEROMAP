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

    const generateButton = page.getByRole('button', { name: 'Generar ruta operativa' });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    await expect(page.getByText('Mejor ruta encontrada (ACO)')).toBeVisible({ timeout: 45_000 });

    const simulateButton = page.getByTestId('optimization-simulate-route');
    await expect(simulateButton).toBeVisible({ timeout: 15_000 });
    await simulateButton.click();

    await expect(page.getByTestId('optimization-playback-panel')).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Generar ruta operativa' })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole('button', { name: 'Generar ruta operativa' }).click();
    await expect(page.getByText('Mejor ruta encontrada (ACO)')).toBeVisible({ timeout: 45_000 });

    await page.goto('/optimization?playback=1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('optimization-playback-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('route-playback-speed-4x')).toBeVisible();
  });
});
