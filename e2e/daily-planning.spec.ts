import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';

test.describe('Planificación operativa — plan del día', () => {
  test.beforeEach(async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({
      timeout: 45_000,
    });
  });

  test('muestra plan del día y acciones administrativas', async ({ page }) => {
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible();

    await page.getByTestId('optimization-experience-chip').click();
    await expect(page.getByTestId('optimization-experience-stepper')).toBeVisible();

    await page.getByTestId('optimization-more-context').locator('summary').click();
    await expect(page.getByTestId('optimization-desk-intro')).toBeVisible();

    await page.getByText('Ciclo administrativo').click();
    await expect(page.getByTestId('daily-timeline-stepper')).toBeVisible();

    await expect(page.getByTestId('optimization-pending-section')).toBeVisible();
    await page.getByTestId('optimization-pending-section').locator('summary').click();
    await expect(page.getByTestId('pending-management-panel')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Actualizar pendientes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar día' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar ruta operativa' })).toBeVisible();
  });

  test('abre gestión de pendientes con hash #pendientes', async ({ page }) => {
    await page.goto('/optimization#pendientes');
    await expect(page.getByTestId('optimization-pending-section')).toHaveAttribute('open');
    await expect(page.getByTestId('pending-management-panel')).toBeVisible();
  });
});

test.describe('Planificación operativa — flujo semanal', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('muestra stepper directivo y detalle del plan', async ({ page }) => {
    await ensurePlannerSession(page, '/simulation?view=weekly');
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('weekly-plan-stepper')).toBeVisible();
    await expect(page.getByText('Configurar días')).toBeVisible();
    await expect(page.getByText('Validar (ACO)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible();
  });
});

test.describe('Planificación operativa — ciclo hub a historial', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('hub de planificación accesible', async ({ page }) => {
    await ensurePlannerSession(page, '/planning');
    await expect(page.getByTestId('planner-hub')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Hub de planificación' })).toBeVisible();
    await expect(page.getByText('Mi planificación')).toBeVisible();
  });

  test('monitoreo operativo accesible', async ({ page }) => {
    await ensurePlannerSession(page, '/monitoring');
    await expect(page.getByText(/Monitoreo en tiempo real|Supervisión operativa|Flota en vivo/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('historial unificado carga semana por defecto', async ({ page }) => {
    await ensurePlannerSession(page, '/planning/history');
    await expect(page.getByText('Historial unificado de planificación')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Días de la semana')).toBeVisible({ timeout: 30_000 });
  });
});
