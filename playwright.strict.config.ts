import { defineConfig, devices } from '@playwright/test';

/**
 * Perfil estricto: corre la app con `VITE_USE_MOCKS=false` para verificar que,
 * cuando la API falla, las vistas muestran error/vacío y nunca datos demo.
 *
 * Los tests abortan selectivamente los endpoints de cada vista (la API real
 * sigue arriba para auth y bootstrap), de modo que no se necesita apagar el
 * backend.
 */
const webPort = Number(process.env.E2E_STRICT_WEB_PORT ?? 5174);
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './e2e/strict',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- --port ${webPort}`,
    port: webPort,
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_USE_MOCKS: 'false',
      VITE_API_PROXY_TARGET: apiUrl,
    },
  },
  projects: [
    {
      name: 'strict',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    apiUrl,
    mode: 'strict',
  },
});
