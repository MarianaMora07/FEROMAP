import { expect, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8000';
export const PLAN_EMAIL = 'plan@fero.com';
export const PLAN_PASSWORD = '123456789';

export async function ensurePlannerSession(page: Page, landingPath = '/optimization') {
  const apiResponse = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: PLAN_EMAIL, password: PLAN_PASSWORD },
  });

  if (apiResponse.ok()) {
    const body = (await apiResponse.json()) as { accessToken: string };
    await page.addInitScript((token: string) => {
      localStorage.setItem('feromap.auth.token', token);
    }, body.accessToken);
  }

  const pathOnly = landingPath.split('?')[0]!;
  await page.goto(landingPath, { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/login')) {
    await page.getByRole('button', { name: 'Planificador' }).click();
    await page.getByLabel('Contraseña').fill(PLAN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname.startsWith(pathOnly), { timeout: 20_000 });
  }
}

export async function expectNoPageErrors(page: Page) {
  page.on('pageerror', (error) => {
    throw new Error(`Error en la página: ${error.message}`);
  });
}

export async function gotoDom(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}
