import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';
import {
  autofillIfNeeded,
  openWeeklyPlanByStatus,
  selectDraftWeeklyPlan,
} from './helpers/weekly-plan-session';

// Flujo nuevo (Fase A opcional): plan semanal = config base → generar plan
// operativo de la semana (motor real, secuencial) → tabla Camión × Día →
// abrir un día → estado persistido al recargar (el despacho es automático).
// El motor ACO es lento: timeouts amplios.
test.describe('Plan operativo semanal — generar, abrir y estado', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('aprobar → generar → abrir día → estado persiste', async ({
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
    await expect(page.getByTestId('weekly-plan-forecast')).toBeVisible({
      timeout: 600_000,
    });

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByTestId('weekly-plan-approve-blocked')).toHaveCount(0);

    // "Ver plan" reutiliza el plan operativo ya persistido por la validación (una sola
    // pasada del motor) y abre la planificación operativa. Volvemos (SPA) para aprobar
    // la semana ya revisada.
    await page.getByTestId('weekly-plan-review-cta').click();
    await expect(page).toHaveURL(/\/optimization/, { timeout: 1_500_000 });
    await page.goBack();
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Aprobar' }).click();
    await page.getByTestId('weekly-plan-primary-cta').click();
    await expect(page.getByTestId('weekly-plan-post-approval-checklist')).toBeVisible({
      timeout: 60_000,
    });

    // El plan operativo ya fue generado por "Ver plan"; la tabla camión × día vive en «Operación».
    await page.getByTestId('weekly-plan-step4-tab-operacion').click();
    await expect(page.getByTestId('weekly-operational-table')).toBeVisible({ timeout: 60_000 });

    // Abrir un día desde la tabla
    const firstDayLink = page.locator('[data-testid^="weekly-open-day-"]').first();
    await expect(firstDayLink).toBeVisible({ timeout: 15_000 });
    await firstDayLink.click();
    await expect(page).toHaveURL(/\/optimization/, { timeout: 60_000 });

    // Volver al editor (vía el listado de semanas) y ver el estado persistido de los días.
    await openWeeklyPlanByStatus(page, request, 'approved');
    await page.getByTestId('weekly-plan-step4-tab-operacion').click();
    await expect(page.getByTestId('weekly-operational-table')).toBeVisible({ timeout: 60_000 });

    // Recargar: el estado del día debe persistir (payload deriva estado vivo).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('weekly-plan-step4-tab-operacion').click();
    await expect(page.getByTestId('weekly-operational-table')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/(Notificado|Optimizado|Cerrado)/).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
