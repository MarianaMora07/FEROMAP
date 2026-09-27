import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';
import {
  autofillIfNeeded,
  selectDraftWeeklyPlan,
} from './helpers/weekly-plan-session';

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

    // Cuatro destinos de primer nivel: Plan · Rutas por vehículo · Resultados · Pendientes.
    await expect(page.getByTestId('plan-day-tab-plan')).toBeVisible();
    await expect(page.getByTestId('plan-day-tab-routes')).toBeVisible();
    await expect(page.getByTestId('plan-day-tab-results')).toBeVisible();
    await expect(page.getByTestId('plan-day-tab-pending')).toBeVisible();
    await expect(page.getByTestId('plan-day-tab-plan')).toHaveText('Plan');
    // El id legado `optimize` ya no existe (Fase D).
    await expect(page.getByTestId('plan-day-tab-optimize')).toHaveCount(0);

    // «Experiencia del día» (guía previa al despacho) se oculta en un día despachado/cerrado.
    const experienceChip = page.getByTestId('optimization-experience-chip');
    if (await experienceChip.isVisible()) {
      await experienceChip.click();
      await expect(page.getByTestId('optimization-experience-stepper')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('optimization-experience-stepper')).toBeHidden();
    }

    // Herramientas en el menú "⋯", agrupadas por secciones (P1, I).
    await page.getByTestId('optimization-page-menu').click();
    await expect(page.getByTestId('optimization-menu-export-pdf')).toBeVisible();
    await expect(page.getByTestId('optimization-menu-simulate-day')).toBeVisible();
    await expect(page.getByTestId('optimization-menu-contingency')).toBeVisible();
    // El Historial ya no se duplica en el menú (vive en el sidebar como «Historial unificado»).
    await expect(page.getByText('Historial de planificación')).toHaveCount(0);
    await page.getByTestId('optimization-page-menu').click();

    await page.getByTestId('plan-day-tab-pending').click();
    await expect(page.getByTestId('optimization-pending-section')).toBeVisible();
    // J: el panel gestionable se muestra directo (sin <details> intermedio).
    await expect(page.getByTestId('pending-management-panel')).toBeVisible();

    // El día puede llegar sin rutas ("Generar"), despachado ("Monitoreo"/"Cerrar día" o
    // indicador de notificación) o cerrado ("Ver resultados").
    const showsCta =
      (await page.getByTestId('optimization-generate-route').isVisible()) ||
      (await page.getByTestId('optimization-notify-indicator').isVisible()) ||
      (await page.getByTestId('optimization-monitoring-route').isVisible()) ||
      (await page.getByTestId('optimization-view-results').isVisible()) ||
      (await page.getByTestId('optimization-close-day-action').isVisible());
    expect(showsCta).toBeTruthy();
  });

  test('abre gestión de pendientes con hash #pendientes', async ({ page }) => {
    await page.goto('/optimization#pendientes');
    // J: el hash activa la pestaña Pendientes y el panel se muestra directo.
    await expect(page.getByTestId('plan-day-tab-pending')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('optimization-pending-section')).toBeVisible();
    await expect(page.getByTestId('pending-management-panel')).toBeVisible();
  });

  test('limpia el parámetro obsoleto `view` de la URL', async ({ page }) => {
    await page.goto('/optimization?view=desglose', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => new URL(page.url()).searchParams.has('view')).toBe(false);
  });

  test('en móvil el mapa va antes que el resumen y no hay scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({ timeout: 45_000 });
    // P2 (G/H): en móvil la cabecera conserva el contexto (chip-resumen) y el stepper accesible.
    await expect(page.getByTestId('optimization-compact-chip')).toBeVisible();
    await expect(page.getByTestId('optimization-experience-icon')).toBeVisible();

    // P3: un día sin rutas muestra el bloque «Siguiente paso» en vez del mapa/resumen.
    await expect(
      page
        .locator('[data-testid="optimization-next-step"], [data-testid="operational-map-container"]')
        .first(),
    ).toBeVisible({ timeout: 30_000 });

    if (!(await page.getByTestId('optimization-next-step').isVisible())) {
      // Jerarquía móvil (Fase F): el mapa por encima de «Resumen del día».
      await expect(page.getByTestId('optimization-day-summary')).toBeVisible();
      const mapBox = await page.getByTestId('operational-map-container').boundingBox();
      const summaryBox = await page.getByTestId('optimization-day-summary').boundingBox();
      expect(mapBox).not.toBeNull();
      expect(summaryBox).not.toBeNull();
      expect(mapBox!.y).toBeLessThan(summaryBox!.y);
    }

    // sin scroll horizontal en el contenedor principal
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollWidth - main.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Planificación operativa — flujo semanal', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('muestra stepper directivo y detalle del plan', async ({ page }) => {
    await ensurePlannerSession(page, '/planning/weekly');
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible();
    await expect(page.getByTestId('weekly-plan-stepper')).toBeVisible();
    await expect(page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Validar' })).toBeVisible();
    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Configurar días' }).click();
    await expect(page.getByTestId('weekly-plan-week-calendar')).toBeVisible();
  });

  test('permite aprobar sin validar (la validación es opcional)', async ({ page, request }) => {
    await ensurePlannerSession(page, '/planning/weekly');
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible({ timeout: 45_000 });

    await selectDraftWeeklyPlan(page, request);
    await autofillIfNeeded(page);

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Aprobar' }).click();
    // Ya no hay bloqueo por falta de validación: se ofrece validar como acción opcional
    // y la guarda al aprobar es la verificación de viabilidad del servidor.
    await expect(page.getByTestId('weekly-plan-optional-validation')).toBeVisible();
    await expect(page.getByTestId('weekly-plan-primary-cta')).toBeVisible();
    await expect(page.getByText('Falta validar', { exact: true })).toHaveCount(0);
  });

  test('flujo completo: borrador, autocompletar, validar y ver plan', async ({
    page,
    request,
  }) => {
    test.setTimeout(1_800_000);
    await ensurePlannerSession(page, '/planning/weekly');
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });

    await selectDraftWeeklyPlan(page, request);
    await expect(page.getByTestId('weekly-plan-tab')).toBeVisible();

    await autofillIfNeeded(page);

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Validar' }).click();
    await page.getByTestId('weekly-plan-primary-cta').click();
    await expect(page.getByTestId('weekly-plan-forecast')).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('weekly-plan-stepper').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByTestId('weekly-plan-approve-blocked')).toHaveCount(0);

    // "Ver plan" reutiliza el plan operativo persistido por la validación (una sola
    // pasada del motor) y abre la planificación operativa del primer día; la
    // aprobación queda para después.
    await page.getByTestId('weekly-plan-review-cta').click();
    await expect(page).toHaveURL(/\/optimization/, { timeout: 1_500_000 });
  });

  test('redirige la URL legada de simulación al plan semanal operativo', async ({ page }) => {
    await ensurePlannerSession(page, '/simulation?view=weekly');
    await expect(page).toHaveURL(/\/planning\/weekly/, { timeout: 45_000 });
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible();
  });

  test('redirige la URL legada de optimización 3 niveles al plan semanal', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization/levels');
    await expect(page).toHaveURL(/\/planning\/weekly/, { timeout: 45_000 });
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible();
  });
});

test.describe('Planificación operativa — ciclo hub a historial', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('dashboard actúa como hub de planificación', async ({ page }) => {
    await ensurePlannerSession(page, '/');
    await expect(page.getByTestId('planner-hub')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Mi planificación')).toBeVisible();
  });

  test('monitoreo operativo accesible', async ({ page }) => {
    await ensurePlannerSession(page, '/monitoring');
    await expect(page.getByText(/Monitoreo en tiempo real|Supervisión operativa|Flota en vivo/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('monitoring-tab-map')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('monitoring-tab-incidents').click();
    await expect(page.getByTestId('monitoring-tab-incidents')).toHaveAttribute('aria-selected', 'true');
  });

  test('historial unificado carga semana por defecto', async ({ page }) => {
    await ensurePlannerSession(page, '/planning/history');
    await expect(page.getByText('Historial unificado de planificación')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Días de la semana')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Separación de módulos — nivel y resultados', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('cada módulo muestra su nivel de planificación', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-level-chip')).toBeVisible({ timeout: 45_000 });

    await ensurePlannerSession(page, '/planning/weekly');
    await expect(page.getByTestId('planning-level-banner')).toBeVisible({ timeout: 45_000 });
  });

  test('la cabecera del día y el calendario muestran estado y leyenda', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('optimization-level-chip')).toBeVisible();
    // Chip de estado del día (Fase 3): presente cuando el día tiene plan.
    const statusChip = page.getByTestId('optimization-status-chip');
    if ((await statusChip.count()) > 0) {
      await expect(statusChip).toBeVisible();
    }

    // Leyenda de estados (Fase 3) dentro del calendario del día.
    await page.getByTestId('optimization-date-trigger').click();
    await expect(page.getByTestId('optimization-week-calendar-popover')).toBeVisible();
    const legend = page.getByTestId('optimization-status-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('Carry-over pendientes');
  });

  test('como máximo una banda de estado contextual a la vez', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({ timeout: 45_000 });
    const bandTestIds = [
      'optimization-context-error',
      'optimization-week-pending-band',
      'optimization-dispatch-banner',
      'optimization-contextual-cta',
    ];
    let bands = 0;
    for (const id of bandTestIds) bands += await page.getByTestId(id).count();
    expect(bands).toBeLessThanOrEqual(1);
  });

  test('cada métrica del día aparece una sola vez', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({ timeout: 45_000 });

    // P3: en un día borrador el tab Plan muestra solo «Siguiente paso» (sin resumen).
    await expect(
      page
        .locator('[data-testid="optimization-next-step"], [data-testid="optimization-day-summary"]')
        .first(),
    ).toBeVisible({ timeout: 45_000 });
    if (await page.getByTestId('optimization-next-step').isVisible()) {
      await expect(page.getByTestId('optimization-day-summary')).toHaveCount(0);
      return;
    }

    // Una sola tarjeta de resumen y una sola fila de distancia del día (Fase C).
    await expect(page.getByTestId('optimization-day-summary')).toHaveCount(1);
    await expect(page.getByText('Distancia total (flota)')).toHaveCount(1);
  });

  test('Resultados no muestra datos reales sin el día cerrado', async ({ page }) => {
    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('plan-day-tab-results').click();

    // Con el día cerrado, la vista principal es el previsto vs. real; si no, estado vacío.
    const closed = await page.getByTestId('optimization-day-actuals').isVisible();
    if (closed) {
      await expect(page.getByTestId('optimization-results-empty')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('optimization-results-empty')).toBeVisible();
      await expect(page.getByTestId('optimization-day-actuals')).toHaveCount(0);
    }
  });
});
