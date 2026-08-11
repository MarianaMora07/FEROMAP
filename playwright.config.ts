import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './e2e',
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
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_USE_MOCKS: 'true',
      VITE_API_PROXY_TARGET: apiUrl,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    apiUrl,
  },
});
