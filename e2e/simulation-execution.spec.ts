import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8000';
const PLAN_EMAIL = 'plan@fero.com';
const PLAN_PASSWORD = '123456789';

async function ensurePlannerSession(page: Page) {
  const apiResponse = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: PLAN_EMAIL, password: PLAN_PASSWORD },
  });

  if (apiResponse.ok()) {
    const body = (await apiResponse.json()) as { accessToken: string };
    await page.addInitScript((token: string) => {
      localStorage.setItem('feromap.auth.token', token);
    }, body.accessToken);
  }

  await page.goto('/simulation');

  if (page.url().includes('/login')) {
    await page.getByRole('button', { name: 'Planificador' }).click();
    await page.getByLabel('Contraseña').fill(PLAN_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL('**/simulation**', { timeout: 20_000 });
  }

  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible({ timeout: 45_000 });
}

test.describe('Simulación — ejecución y cancelación', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (error) => {
      throw new Error(`Error en la página: ${error.message}`);
    });
    await ensurePlannerSession(page);
    await expect(page.getByTestId('wizard-step-nav')).toBeVisible();
  });

  test('ejecutar → ver stepper → cancelar → estado limpio', async ({ page }) => {
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('button', { name: 'Ejecutar simulación' })).toBeVisible();

    await page.getByTestId('execute-simulation-btn').click();

    await expect(page.getByTestId('execution-stepper')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('wizard-execution-substatus')).toContainText(
      /Ejecutando — fase \d+ de 8:/,
      { timeout: 20_000 },
    );

    await page.getByTestId('cancel-execution-btn').click();
    await expect(page.getByText('¿Cancelar la ejecución?')).toBeVisible();
    await page.getByTestId('confirm-cancel-execution').click();

    await expect(page.getByText(/Ejecución cancelada/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('execute-simulation-btn')).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByTestId('cancel-execution-btn')).toHaveCount(0);
    await expect(page.getByTestId('wizard-execution-substatus')).toHaveCount(0);
  });

  test('tecla Esc abre confirmación de cancelación', async ({ page }) => {
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByTestId('execute-simulation-btn').click();
    await expect(page.getByTestId('execution-stepper')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByText('¿Cancelar la ejecución?')).toBeVisible();
    await page.getByRole('button', { name: 'Seguir ejecutando' }).click();
    await expect(page.getByTestId('cancel-execution-btn')).toBeVisible();
  });
});
