import { expect, type Page } from '@playwright/test';

export const RESIDENT_EMAIL = 'residente@fero.com';
export const RESIDENT_PASSWORD = '123456789';

const RESIDENT_USER = {
  id: 20,
  email: RESIDENT_EMAIL,
  firstName: 'Ana',
  lastName: 'Residente',
  role: 'residente',
  sectorId: 1,
  sectorName: 'Unare I',
};

export function residentOverviewMock() {
  return {
    sectorName: 'Unare I',
    schedule: {
      collectionDays: 'Lunes, Miércoles, Viernes',
      window: '07:00 — 12:00',
      nextCollection: 'Viernes 15/08',
      nextCollectionAt: '2026-08-15T11:00:00.000Z',
      frequency: '3x/semana',
      isCollectionDay: true,
      hasWeeklyPlan: true,
      hasSchedule: true,
      source: 'weekly_plan',
      calendar: [{ date: '2026-08-13', weekday: 3, label: 'Miércoles' }],
    },
    proximity: {
      status: 'approaching',
      vehicleCode: 'TR-08',
      routeId: 42,
      estimatedMinutes: 18,
      stopsBeforeSector: 2,
      nextStopInSector: 'CNT-001',
      completedStopsInSector: 0,
      totalStopsInSector: 3,
      lastUpdatedAt: new Date().toISOString(),
    },
    collectionPoints: [
      {
        id: 'CNT-001',
        address: 'CNT-001',
        fillLevel: 72,
        status: 'lleno',
        lastEmptiedAt: '2026-08-10T12:00:00.000Z',
        lng: -62.75,
        lat: 8.27,
      },
      {
        id: 'CNT-002',
        address: 'CNT-002',
        fillLevel: 45,
        status: 'parcial',
        lastEmptiedAt: null,
        lng: -62.74,
        lat: 8.271,
      },
    ],
    activeRoutesInSector: [
      {
        routeId: 42,
        vehicle: 'TR-08',
        status: 'in_progress',
        stopsInSector: 3,
        pendingStops: 2,
        nextStop: 'CNT-001',
      },
    ],
    alerts: [
      {
        title: 'Horario de recolección',
        detail: 'Tu sector (Unare I) tiene recolección: Lunes, Miércoles, Viernes · 07:00 — 12:00.',
      },
    ],
    stats: {
      totalPoints: 2,
      criticalPoints: 0,
      routesServingSector: 1,
    },
  };
}

function residentProximityMock() {
  return residentOverviewMock().proximity;
}

function sectorsGeoMock() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 1, name: 'Unare I' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-62.76, 8.26],
              [-62.73, 8.26],
              [-62.73, 8.28],
              [-62.76, 8.28],
              [-62.76, 8.26],
            ],
          ],
        },
      },
    ],
  };
}

function mapContextMock() {
  return {
    vehicles: [
      {
        id: 'TR-08',
        status: 'en-ruta',
        driver: 'Juan Pérez',
        route: 'Ruta Norte',
        progress: 55,
        speedKmh: 32,
        nextPoint: 'CNT-001',
        color: '#1143F3',
        image: '',
        lng: -62.745,
        lat: 8.268,
        routeId: 42,
      },
    ],
    routes: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { routeId: 42, label: 'Ruta 42' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-62.76, 8.26],
              [-62.75, 8.27],
              [-62.74, 8.271],
            ],
          },
        },
      ],
    },
    containers: {
      type: 'FeatureCollection',
      features: [],
    },
    mapMetrics: [],
    liveActivities: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function setupResidentApiMocks(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { email?: string } | null;
    if (body?.email === RESIDENT_EMAIL) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'e2e-resident-token',
          tokenType: 'bearer',
          user: RESIDENT_USER,
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/v1/auth/me', async (route) => {
    const auth = route.request().headers()['authorization'] ?? '';
    if (auth.includes('e2e-resident-token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RESIDENT_USER),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/v1/profile/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...RESIDENT_USER,
        preferences: { theme: 'system', language: 'es' },
      }),
    });
  });

  await page.route('**/api/v1/resident/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(residentOverviewMock()),
    });
  });

  await page.route('**/api/v1/resident/proximity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(residentProximityMock()),
    });
  });

  await page.route('**/api/v1/sectors', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sectorsGeoMock()),
    });
  });

  await page.route('**/api/v1/map/context**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mapContextMock()),
    });
  });

  await page.route('**/api/v1/alerts/activity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/alerts', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [
          {
            id: 'al-res-1',
            priority: 'advertencia',
            title: 'Retraso en recolección',
            detail: 'Retraso estimado 20 min en Unare I',
            source: 'Ruta TR-08',
            location: 'Unare I',
            datetime: '13/08/2026 10:00',
            status: 'en-progreso',
            category: 'trafico',
            lng: -62.75,
            lat: 8.27,
          },
          {
            id: 'al-internal',
            priority: 'informativa',
            title: 'Mantenimiento taller',
            detail: 'Vehículo en taller central',
            source: 'Taller Central',
            location: 'Oficina',
            datetime: '13/08/2026 09:00',
            status: 'informativa',
            category: 'mantenimiento',
            lng: -62.7,
            lat: 8.29,
          },
        ],
        stats: {
          critical: 0,
          warning: 1,
          informational: 1,
          resolvedToday: 0,
          totalActive: 2,
        },
      }),
    });
  });

  await page.route('**/api/v1/collection-points/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kpis: { total: 2, critico: 0, lleno: 1, parcial: 1, normal: 0 },
        distribution: [],
        sectors: ['Unare I'],
      }),
    });
  });

  await page.route('**/api/v1/collection-points', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const overview = residentOverviewMock();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        overview.collectionPoints.map((point) => ({
          id: point.id,
          label: point.id,
          code: point.id,
          address: point.address,
          sector: overview.sectorName,
          fillLevel: point.fillLevel,
          status: point.status,
          active: true,
          containerType: 'Estándar',
          capacityL: 1200,
          lastCollection: '10/08/2026',
          frequency: 'Semanal',
          lng: point.lng,
          lat: point.lat,
        })),
      ),
    });
  });
}

export async function ensureResidentSession(page: Page, landingPath = '/resident') {
  await setupResidentApiMocks(page);

  await page.addInitScript(() => {
    localStorage.setItem('feromap.auth.token', 'e2e-resident-token');
  });

  const pathOnly = landingPath.split('?')[0]!;
  await page.goto(landingPath, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/login')) {
    await page.getByRole('button', { name: 'Residente' }).click();
    await page.locator('input[name="password"]').fill(RESIDENT_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname.startsWith(pathOnly), { timeout: 20_000 });
  }
}

export async function loginResidentFromScratch(page: Page) {
  await setupResidentApiMocks(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Residente' }).click();
  await page.locator('input[name="password"]').fill(RESIDENT_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/resident/, { timeout: 20_000 });
}

export function expectNoPageErrors(page: Page) {
  page.on('pageerror', (error) => {
    throw new Error(`Error en la página: ${error.message}`);
  });
}
