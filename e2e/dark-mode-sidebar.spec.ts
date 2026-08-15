import { expect, test, type Page } from '@playwright/test';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';
import { ensureOperatorSession } from './helpers/operator-session';
import { loginResidentFromScratch } from './helpers/resident-session';
import path from 'node:path';

const CAPTURES_DIR = path.join('docs', 'fase-6', 'capturas');

async function stubProfileTheme(page: Page, theme: 'light' | 'dark' | 'system') {
  await page.route('**/api/v1/profile/me', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const profile = (await response.json()) as {
      preferences: Record<string, unknown>;
    };
    profile.preferences = { ...profile.preferences, theme };
    await route.fulfill({ json: profile });
  });
}

async function expectSidebarDark(page: Page, dark: boolean) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(dark);
}

async function toggleThemeFromUserMenu(page: Page) {
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('user-menu-theme-toggle').click();
}

async function captureSidebar(page: Page, filename: string) {
  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toBeVisible();
  await sidebar.screenshot({ path: path.join(CAPTURES_DIR, filename) });
}

test.describe('Modo oscuro integrado — sidebar', () => {
  test('planificador: sidebar light vs dark (capturas)', async ({ page }) => {
    expectNoPageErrors(page);
    await stubProfileTheme(page, 'light');
    await ensurePlannerSession(page, '/');
    await expect(page.getByTestId('sidebar-nav-simulation')).toBeVisible();
    await expectSidebarDark(page, false);
    await captureSidebar(page, 'sidebar-planner-light.png');

    await toggleThemeFromUserMenu(page);
    await expectSidebarDark(page, true);
    await captureSidebar(page, 'sidebar-planner-dark.png');
  });

  test('planificador: toggle sidebar persiste dark tras F5', async ({ page }) => {
    expectNoPageErrors(page);
    await stubProfileTheme(page, 'light');
    await ensurePlannerSession(page, '/');

    await toggleThemeFromUserMenu(page);
    await expectSidebarDark(page, true);

    await stubProfileTheme(page, 'dark');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectSidebarDark(page, true);
  });

  test('operador: nav reducida visible en dark', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureOperatorSession(page, '/operator');
    await toggleThemeFromUserMenu(page);
    await expectSidebarDark(page, true);

    await expect(page.getByTestId('sidebar-nav-operator')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-map')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-alerts')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-simulation')).toHaveCount(0);
    await captureSidebar(page, 'sidebar-operator-dark.png');
  });

  test('residente: nav reducida visible en dark', async ({ page }) => {
    expectNoPageErrors(page);
    await loginResidentFromScratch(page);
    await toggleThemeFromUserMenu(page);
    await expectSidebarDark(page, true);

    await expect(page.getByTestId('sidebar-nav-resident')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-map')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-alerts')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-simulation')).toHaveCount(0);
    await captureSidebar(page, 'sidebar-resident-dark.png');
  });

  test('sidebar nav link muestra foco visible con teclado', async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, '/');

    const link = page.getByTestId('sidebar-nav-simulation');
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS('outline-style', 'none');
    await expect(link).toHaveCSS('box-shadow', /rgb/);
  });
});
