import { expect, test } from '@playwright/test';
import { ensurePlannerSession } from './helpers/planner-session';

test.describe('Catálogos — lectura y formularios (planificador)', () => {
  test('vehículos: tabla de flota accesible', async ({ page }) => {
    await ensurePlannerSession(page, '/vehicles');
    await expect(page.getByText('Catálogo de flota')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Placa|Estado|Conductor/).first()).toBeVisible();
  });

  test('conductores: listado y apertura del formulario', async ({ page }) => {
    await ensurePlannerSession(page, '/drivers');
    await expect(page.getByRole('heading', { name: 'Conductores' })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole('button', { name: 'Nuevo conductor' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo conductor' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo conductor' })).not.toBeVisible();
  });

  test('puntos de recolección: mapa/listado y apertura del formulario', async ({ page }) => {
    await ensurePlannerSession(page, '/collection-points');
    await expect(page.getByRole('button', { name: 'Nuevo punto' })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole('button', { name: 'Nuevo punto' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo punto de recolección' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo punto de recolección' })).not.toBeVisible();
  });
});
