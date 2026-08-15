import { expect, test } from '@playwright/test';
import {
  ensurePlannerSession,
  expectNoPageErrors,
} from './helpers/planner-session';

test.describe('Demostración ACO', () => {
  test.beforeEach(async ({ page }) => {
    await expectNoPageErrors(page);
    await ensurePlannerSession(page, '/demostracion');
    await expect(page.getByTestId('demostracion-page')).toBeVisible({ timeout: 20_000 });
  });

  test('navegar, iniciar demo y ver convergencia', async ({ page }) => {
    await page.getByTestId('demostracion-tab-laberinto').click();
    await expect(page.getByTestId('demo-playback-controls')).toBeVisible();

    await page.getByTestId('demo-playback-start').click();
    await expect(page.getByTestId('demo-playback-status')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('demo-playback-status')).toContainText(/Iteración/);

    await page.getByTestId('demostracion-tab-convergencia').click();
    await expect(page.getByTestId('demo-convergence-results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('demo-convergence-chart')).toBeVisible();
  });
});
