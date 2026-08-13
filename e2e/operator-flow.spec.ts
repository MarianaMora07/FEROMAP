import { expect, test } from '@playwright/test';
import { ensureOperatorSession, expectNoPageErrors } from './helpers/operator-session';

test.describe('Operador en campo — flujo completo', () => {
  test.beforeEach(async ({ page }) => {
    expectNoPageErrors(page);
    await ensureOperatorSession(page, '/operator');
    await expect(page.getByTestId('operator-hub')).toBeVisible({ timeout: 45_000 });
  });

  test('login conductor, hub, ruta, mapa, reporte avería y resumen', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Mi operación' })).toBeVisible();
    await expect(page.getByTestId('operator-next-action')).toBeVisible();
    await expect(page.getByTestId('operator-route-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('operator-stops-stepper')).toBeVisible();

    await page.getByTestId('operator-stop-item-1').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('operator-route-panel').getByRole('link', { name: 'Mapa mi ruta' }).click();
    await expect(page).toHaveURL(/\/map/, { timeout: 15_000 });

    await page.goto('/operator');
    await expect(page.getByTestId('operator-route-panel')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Ver plan del día' }).first().click();
    await expect(page.getByTestId('operator-daily-plan')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('operator-day-summary')).toBeVisible();

    await page.goto('/operator#reportar-averia');
    await expect(page.getByTestId('breakdown-reporter')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('breakdown-reporter').getByRole('button', { name: 'Reportar avería' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirmar reporte de avería' })).toBeVisible();
    await page.getByRole('button', { name: 'Sí, reportar avería' }).click();

    await expect(page.getByTestId('operator-contingency-success')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('operator-my-incidents')).toBeVisible({ timeout: 15_000 });
  });

  test('sin acciones administrativas de planificación', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Cerrar día' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Despachar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generar ruta operativa' })).toHaveCount(0);
  });
});

test.describe('Operador en campo — accesibilidad', () => {
  test.beforeEach(async ({ page }) => {
    expectNoPageErrors(page);
    await ensureOperatorSession(page, '/operator');
    await expect(page.getByTestId('operator-hub')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('operator-route-panel')).toBeVisible({ timeout: 30_000 });
  });

  test('stepper de paradas y estados de carga accesibles', async ({ page }) => {
    const stepper = page.getByTestId('operator-stops-stepper');
    await expect(stepper).toHaveAttribute('aria-label', /paradas/i);
    await expect(stepper.locator('[aria-current="step"]')).toBeVisible();

    await page.getByTestId('operator-stop-item-1').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Ver plan del día' }).first().click();
    await expect(page.getByRole('status', { name: /Cargando plan del día/i })).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test('formulario de avería con foco en modal de confirmación', async ({ page }) => {
    await page.goto('/operator#reportar-averia');
    const reporter = page.getByTestId('breakdown-reporter');
    await expect(reporter).toBeVisible({ timeout: 20_000 });

    const notes = reporter.locator('textarea');
    if ((await notes.count()) > 0) {
      await notes.focus();
      await expect(notes).toBeFocused();
    }

    await reporter.getByRole('button', { name: 'Reportar avería' }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirmar reporte de avería' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Sí, reportar avería' })).toBeFocused();
  });
});
