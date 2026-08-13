import { expect, type Page } from '@playwright/test';

export const OPERATOR_EMAIL = 'conductor@fero.com';
export const OPERATOR_PASSWORD = '123456789';

const OPERATOR_USER = {
  id: 10,
  email: OPERATOR_EMAIL,
  firstName: 'Juan',
  lastName: 'Pérez',
  role: 'conductor',
  driverId: 1,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function operatorSnapshotMock() {
  const operationDate = todayIso();
  const stops = Array.from({ length: 8 }, (_, index) => {
    const order = index + 1;
    const status = order <= 5 ? 'visited' : order === 6 ? 'omitted' : 'pending';
    return {
      waypointId: order,
      sequenceOrder: order,
      status,
      collectionPointId: order,
      code: `CNT-00${order}`,
      sectorName: 'Unare I',
      address: `Parada demo ${order}`,
      lng: -62.14 + index * 0.001,
      lat: 8.28 + index * 0.001,
      estimatedArrivalAt: `${operationDate}T${String(7 + index).padStart(2, '0')}:15:00.000Z`,
      actualArrivalAt: status === 'visited' ? `${operationDate}T08:00:00.000Z` : null,
    };
  });
  const stopsDone = stops.filter((stop) => stop.status === 'visited').length;
  const nextStop = stops.find((stop) => stop.status === 'pending') ?? null;

  return {
    operationDate,
    dailyPlanId: 1,
    dailyPlanStatus: 'dispatched',
    routeId: 1,
    vehicleId: 'TR-08',
    routeLabel: 'Ruta Norte 01',
    progress: 68,
    stopsDone,
    stopsTotal: stops.length,
    totalDistanceKm: 28.6,
    traveledDistanceKm: 19.4,
    remainingDistanceKm: 12.4,
    nextStop,
    stops,
  };
}

export async function setupOperatorApiMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('feromap.demo.operatorClosedDay');
  });

  await page.route('**/api/v1/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { email?: string } | null;
    if (body?.email === OPERATOR_EMAIL) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'e2e-operator-token',
          tokenType: 'bearer',
          user: OPERATOR_USER,
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    const auth = route.request().headers()['authorization'] ?? '';
    if (auth.includes('e2e-operator-token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OPERATOR_USER),
      });
      return;
    }
    await route.continue();
  });

  const operationDate = todayIso();
  await page.route(`**/api/v1/planning/daily/${operationDate}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        operationDate,
        status: 'dispatched',
        dispatchedAt: `${operationDate}T06:00:00.000Z`,
        scenarioId: 'normal',
        scheduledPoints: [{ id: 1, code: 'CNT-001' }],
        pendingPoints: [],
        pendingPointIds: [],
        finalPointIds: [1, 2, 3],
      }),
    });
  });

  await page.route('**/api/v1/planning/operator-snapshot**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(operatorSnapshotMock()),
    });
  });

  await page.route('**/api/v1/monitoring/status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kpis: [],
        liveFleet: [
          {
            id: 'TR-08',
            status: 'en-ruta',
            driver: 'Juan Pérez',
            route: 'Ruta Norte 01',
            progress: 68,
            speedKmh: 45,
            nextPoint: 'CNT-007',
            color: '#1143F3',
            image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=160&h=120&q=80',
            lng: -62.14,
            lat: 8.28,
            routeId: 1,
          },
        ],
        routeProgress: [],
        monitoringAlerts: [],
        fleetCounts: { total: 1, inRoute: 1, available: 0, maintenance: 0, inactive: 0 },
      }),
    });
  });

  await page.route('**/api/v1/contingencies/recent**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/contingencies/vehicle-breakdown', async (route) => {
    const incidentId = Math.floor(Date.now() / 1000) % 10000;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        incident: {
          id: incidentId,
          vehicleId: 'TR-08',
          vehicleDbId: 1,
          routeId: 1,
          incidentType: 'breakdown',
          description: 'Avería reportada en E2E',
          reportedAt: new Date().toISOString(),
          affectsActiveRoute: true,
          relatedAlertId: `al-inc-${incidentId}`,
        },
        skippedWaypoints: 2,
        pendingPoints: 2,
        recalculation: null,
        message: `Incidencia #${incidentId} registrada`,
      }),
    });
  });
}

export async function ensureOperatorSession(page: Page, landingPath = '/operator') {
  await setupOperatorApiMocks(page);

  await page.addInitScript(() => {
    localStorage.setItem('feromap.auth.token', 'e2e-operator-token');
  });

  const pathOnly = landingPath.split('?')[0]!;
  await page.goto(landingPath, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/login')) {
    await page.getByRole('button', { name: 'Conductor' }).click();
    await page.getByLabel('Contraseña').fill(OPERATOR_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname.startsWith(pathOnly), { timeout: 20_000 });
  }
}

export async function expectNoPageErrors(page: Page) {
  page.on('pageerror', (error) => {
    throw new Error(`Error en la página: ${error.message}`);
  });
}
