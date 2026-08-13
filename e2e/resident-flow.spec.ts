import { expect, test } from '@playwright/test';
import {
  ensureResidentSession,
  expectNoPageErrors,
  loginResidentFromScratch,
} from './helpers/resident-session';

test.describe('Residente — flujo completo', () => {
  test('login redirige a /resident', async ({ page }) => {
    expectNoPageErrors(page);
    await loginResidentFromScratch(page);
    await expect(page).toHaveURL(/\/resident$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mi Recolección' })).toBeVisible();
  });

  test('hub muestra sector, horario y proximidad con ruta activa', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureResidentSession(page, '/resident');
    await expect(page.getByTestId('resident-hub')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('resident-sector-kpis')).toContainText('Unare I');
    await expect(page.getByTestId('resident-schedule-card')).toBeVisible();
    await expect(page.getByTestId('resident-schedule-card')).toContainText('Lunes, Miércoles, Viernes');
    await expect(page.getByTestId('resident-truck-status-card')).toBeVisible();
    await expect(page.getByTestId('resident-truck-status-card')).toContainText('TR-08');
    await expect(page.getByTestId('resident-next-action')).toContainText(/camino|TR-08/i);
  });

  test('mapa mi sector muestra banner y modo sector', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureResidentSession(page, '/resident');
    await expect(page.getByTestId('resident-hub')).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('resident-quick-actions').getByRole('link', { name: 'Mapa mi sector' }).click();
    await expect(page).toHaveURL(/\/map\?.*scope=sector/, { timeout: 15_000 });
    await expect(page.locator('header').getByText(/Mi sector — Unare I/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Navegación Mi Recolección')).toContainText('Mapa mi sector');
  });

  test('alertas con scope sector filtran avisos internos', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureResidentSession(page, '/alerts?scope=sector');
    await expect(page.getByText(/Avisos de tu sector — Unare I/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Retraso en recolección')).toBeVisible();
    await expect(page.getByText('Mantenimiento taller')).toHaveCount(0);
  });

  test('puntos de recolección muestran banner del sector y enlace al hub', async ({ page }) => {
    expectNoPageErrors(page);
    await ensureResidentSession(page, '/collection-points');
    await expect(page.getByText(/Viendo puntos de Unare I/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel('Navegación Mi Recolección').getByRole('link', { name: 'Mi Recolección' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver a Mi Recolección' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo punto' })).toHaveCount(0);
  });
});
