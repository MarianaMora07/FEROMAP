import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';

test.describe('Planificador — dashboard', () => {
  test('dashboard deja de cargar y muestra hub de planificación', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/');
    await expect(page.getByText('Cargando módulo')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('Cargando tu planificación')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('planner-hub')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('planner-hub')).toContainText('Mi planificación');
  });
});
