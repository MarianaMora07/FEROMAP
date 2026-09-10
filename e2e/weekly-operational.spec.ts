import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';
import {
  autofillIfNeeded,
  selectDraftWeeklyPlan,
} from './helpers/weekly-plan-session';

// Flujo nuevo (Fase A opcional): plan semanal = config base → generar plan
// operativo de la semana (motor real, secuencial) → tabla Camión × Día →
// abrir un día → notificar un día → estado persistido al recargar.
// El motor ACO es lento: timeouts amplios.
test.describe('Plan operativo semanal — generar, abrir y notificar', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('aprobar → generar → abrir día → notificar → estado persiste', async ({
    page,
    request,
  }) => {
    test.setTimeout(3_600_000);

    await ensurePlannerSession(page, '/planning/weekly');
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible({ timeout: 45_000 });

    await selectDraftWeeklyPlan(page, request);
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible();

    await autofillIfNeeded(page);

    // Validar y aprobar la semana
    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Validar' }).click();
    await page.getByTestId('weekly-plan-primary-cta').click();
    await expect(page.getByTestId('weekly-plan-validation-result')).toBeVisible({
      timeout: 600_000,
    });

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByTestId('weekly-plan-approve-blocked')).toHaveCount(0);

    // "Ver plan" genera el plan operativo de la semana y abre la planificación
    // operativa. Volvemos (SPA) para aprobar la semana ya revisada.
    await page.getByTestId('weekly-plan-review-cta').click();
    await expect(page).toHaveURL(/\/optimization/, { timeout: 1_500_000 });
    await page.goBack();
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Aprobar' }).click();
    await page.getByTestId('weekly-plan-primary-cta').click();
    await expect(page.getByTestId('weekly-plan-post-approval-checklist')).toBeVisible({
      timeout: 60_000,
    });

    // El plan operativo ya fue generado por "Ver plan"; la tabla camión × día debe estar.
    await expect(page.getByTestId('weekly-operational-table')).toBeVisible({ timeout: 60_000 });

    // Abrir un día desde la tabla
    const firstDayLink = page.locator('[data-testid^="weekly-open-day-"]').first();
    await expect(firstDayLink).toBeVisible({ timeout: 15_000 });
    await firstDayLink.click();
    await expect(page).toHaveURL(/\/optimization/, { timeout: 60_000 });

    // Volver al plan semanal y notificar un día
    await page.goto('/planning/weekly', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });

    const approvedRow = page.locator('[data-weekly-plan-status="approved"] [role="button"]').first();
    await expect(approvedRow).toBeVisible({ timeout: 30_000 });
    await approvedRow.click();
    await expect(page.getByTestId('weekly-operational-table')).toBeVisible({ timeout: 60_000 });

    const firstNotify = page.locator('[data-testid^="weekly-notify-day-"]').first();
    if (await firstNotify.isVisible()) {
      await firstNotify.click();
      await expect(page.getByText(/notificada/i)).toBeVisible({ timeout: 60_000 });
    }

    // Recargar: el estado notificado debe persistir (payload deriva estado vivo)
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });
    const approvedAfterReload = page
      .locator('[data-weekly-plan-status="approved"] [role="button"]')
      .first();
    await expect(approvedAfterReload).toBeVisible({ timeout: 30_000 });
    await approvedAfterReload.click();
    await expect(page.getByTestId('weekly-operational-table')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Notificado', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
