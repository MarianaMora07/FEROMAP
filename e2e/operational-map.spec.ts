import { expect, test } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';
import { OPERATIONAL_MAP_MIN_ZOOM } from '../src/core/map/operationalMapConfig';

const mockMapContext = {
  vehicles: [
    {
      id: 'TR-08',
      status: 'en-ruta',
      driver: 'Juan Pérez',
      route: 'Ruta Norte 01',
      progress: 68,
      speedKmh: 45,
      nextPoint: 'CNT-045',
      color: '#34D634',
      image: '',
      lng: -62.715,
      lat: 8.295,
    },
  ],
  routes: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'route-1',
          routeId: 1,
          label: 'Ruta TR-08',
          color: '#34D634',
          vehicleId: 'TR-08',
          status: 'in_progress',
          routeKind: 'optimized',
          waypointsTotal: 18,
          waypointsDone: 12,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-62.715, 8.295],
            [-62.718, 8.296],
            [-62.721, 8.297],
          ],
        },
      },
    ],
  },
  containers: { type: 'FeatureCollection', features: [] },
  mapMetrics: [],
  liveActivities: [],
  updatedAt: new Date().toISOString(),
};

async function mockOperationalMapContext(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/map/context**', async (route) => {
    await route.fulfill({ json: mockMapContext });
  });
}

test.describe('Mapa operativo Unare', () => {
  test.beforeEach(({ page }) => {
    expectNoPageErrors(page);
  });

  test('dashboard muestra mapa con al menos una ruta y respeta minZoom', async ({ page }) => {
    await mockOperationalMapContext(page);
    await ensurePlannerSession(page, '/');
    await expect(page.getByText('Cargando mapa operativo')).toHaveCount(0, { timeout: 30_000 });

    const mapHost = page.getByTestId('dashboard-operational-map');
    await expect(mapHost).toBeVisible();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(/Mapa de operaciones en tiempo real/)).toBeVisible();
    await expect(page.getByText(/[1-9]\d* ruta/)).toBeVisible();
    await expect(page.getByTestId('dashboard-route-legend').locator('li')).toHaveCount(1);

    const zoomOut = page.getByRole('button', { name: 'Alejar' });
    for (let i = 0; i < 12; i += 1) {
      await zoomOut.click();
      await page.waitForTimeout(80);
    }

    const zoomLevel = await mapHost.evaluate((el) => Number(el.dataset.zoom ?? '0'));
    expect(zoomLevel).toBeGreaterThanOrEqual(OPERATIONAL_MAP_MIN_ZOOM);
  });

  test('/map permite togglear capa de rutas planificadas', async ({ page }) => {
    await mockOperationalMapContext(page);
    await ensurePlannerSession(page, '/map');
    await expect(page.getByTestId('map-layers-panel')).toBeVisible({ timeout: 30_000 });

    const routesToggle = page.getByTestId('map-layer-routes');
    await expect(routesToggle).toBeVisible();
    await expect(routesToggle).toBeChecked();

    await routesToggle.uncheck();
    await expect(routesToggle).not.toBeChecked();

    await routesToggle.check();
    await expect(routesToggle).toBeChecked();
  });
});
