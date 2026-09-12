import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';

test.describe('Simulación guionada del día — optimización', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('abre, pausa en cada evento, lista el descarte y no muta el día', async ({ page }) => {
    const mutatingRequests: string[] = [];
    page.on('request', (request) => {
      const method = request.method();
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
        request.url().includes('/api/')
      ) {
        mutatingRequests.push(`${method} ${request.url()}`);
      }
    });

    await ensurePlannerSession(page, '/optimization');
    await expect(page.getByTestId('optimization-sticky-toolbar')).toBeVisible({
      timeout: 45_000,
    });

    // El día puede llegar ya optimizado (botón "Generar" oculto) o requerir generación.
    const generateButton = page.getByTestId('optimization-generate-route');
    if (await generateButton.isVisible()) {
      await generateButton.click();
    }

    const openButton = page.getByTestId('optimization-day-simulation-open');
    await expect(openButton).toBeVisible({ timeout: 90_000 });

    // A partir de aquí nada debe mutar el plan: la simulación es de solo lectura.
    mutatingRequests.length = 0;

    await openButton.click();
    await page.waitForURL(/\/optimization\/simulation/);
    await expect(page.getByTestId('day-simulation-page')).toBeVisible();
    await expect(page.getByTestId('operational-map-container')).toBeVisible();
    await expect(page.getByTestId('day-simulation-panel')).toBeVisible();

    const routeRows = page.locator('[data-testid^="day-simulation-route-"]');
    await expect(routeRows).toHaveCount(3);

    // Selector de camiones: ocultar uno reduce las rutas representadas; "Todos" las restaura.
    await expect(page.getByTestId('day-simulation-vehicles')).toBeVisible();
    await page.getByTestId('day-simulation-vehicle-0').click();
    await expect(routeRows).toHaveCount(2);
    await page.getByTestId('day-simulation-vehicles-all').click();
    await expect(routeRows).toHaveCount(3);

    // Estabilidad e impacto del plan visibles en el panel.
    await expect(page.getByTestId('day-simulation-stability')).toBeVisible();
    await expect(page.getByTestId('day-simulation-stability')).toContainText('Estabilidad media');

    // Ir directo al primer evento (35 % de la jornada) sin esperar la animación completa:
    // al reanudar, el motor detiene la reproducción justo en la contingencia.
    await page.getByTestId('day-simulation-scrubber').evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '50';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByTestId('day-simulation-toggle').click();

    await expect(page.getByTestId('day-simulation-step')).toBeVisible({ timeout: 20_000 });
    // La pausa muestra el impacto del paso (estabilidad + reasignados).
    await expect(page.getByTestId('day-simulation-step')).toContainText('estabilidad');
    await expect(page.getByTestId('day-simulation-step')).toContainText('reasignados');

    // Los contenedores ya recorridos se marcan en rojo y así se explica en la leyenda.
    await expect(page.getByTestId('route-playback-legend')).toContainText('Contenedor recorrido');
    const completedStop = page.locator(
      '.route-playback-stop-marker--completed .route-playback-stop-marker__dot',
    );
    await expect(completedStop.first()).toBeAttached();
    const completedBorder = await completedStop
      .first()
      .evaluate((element) => getComputedStyle(element).borderTopColor);
    expect(completedBorder).toBe('rgb(239, 68, 68)');

    // Continuar fusiona el plan alternativo con el tramo: el camión averiado sale,
    // pero los no afectados siguen en el mapa (TR-02) y entra el de reserva (TR-11).
    await page.getByTestId('day-simulation-continue').click();
    await expect(page.getByTestId('day-simulation-step')).toBeHidden();
    await expect(routeRows).toHaveCount(3);
    const tramoText = (await routeRows.allTextContents()).join(' ');
    expect(tramoText).toContain('TR-02');
    expect(tramoText).not.toContain('TR-08');
    expect(tramoText).toContain('TR-11');

    // Pausar, ir al segundo evento (70 %) y reproducir para detenerse allí.
    await page.getByTestId('day-simulation-toggle').click();
    await page.getByTestId('day-simulation-scrubber').evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '80';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByTestId('day-simulation-toggle').click();
    await expect(page.getByTestId('day-simulation-step')).toBeVisible({ timeout: 20_000 });

    // El descarte se lista por criticidad (contenedor y nivel).
    await expect(page.getByTestId('day-simulation-dropped')).toBeVisible();
    await expect(page.getByTestId('day-simulation-dropped')).toContainText('CNT-010');
    await expect(page.getByTestId('day-simulation-dropped')).toContainText('Crítico');

    // Solo lectura: ninguna petición mutante al API durante la simulación.
    expect(mutatingRequests).toEqual([]);

    await page.getByRole('button', { name: 'Cerrar simulación del día' }).click();
    await expect(page.getByTestId('day-simulation-panel')).toBeHidden();
  });
});
