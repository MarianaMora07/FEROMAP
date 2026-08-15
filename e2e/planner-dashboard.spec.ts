import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';

test.describe('Planificador — dashboard', () => {
  test('dashboard muestra home mínimo de planificación', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/');
    await expect(page.getByText('Cargando módulo')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('Cargando tu planificación')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('planner-hub')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Siguiente paso:|Tu jornada de planificación —/)).toBeVisible();
    await expect(page.getByTestId('planner-hub')).toContainText('Mi planificación');
    await expect(page.getByText('Qué hacer ahora')).toBeVisible();
    await expect(page.getByTestId('planner-hub-day-status')).toBeVisible();
    await expect(page.getByTestId('operational-flow-stepper')).toBeVisible();
    await expect(page.getByText('Última simulación')).toHaveCount(0);
    await expect(page.locator('.border-fero-green\\/30').filter({ hasText: /simulaci/i })).toHaveCount(0);

    const situationPanel = page.getByTestId('operational-situation-panel');
    await expect(situationPanel).toBeVisible();
    await expect(situationPanel).not.toHaveAttribute('open');
    await situationPanel.locator('summary').click();
    await expect(situationPanel).toHaveAttribute('open');
    await expect(page.getByTestId('operational-situation-content')).toBeVisible();
    await expect(page.getByTestId('operational-situation-monitoring-link')).toBeVisible();
  });
});
