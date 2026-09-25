import { expect, test } from '@playwright/test';
import { ensurePlannerSession } from './helpers/planner-session';
import { ensureOperatorSession } from './helpers/operator-session';
import { loginResidentFromScratch } from './helpers/resident-session';

/**
 * Arquitectura de navegación por rol (docs/ux/arquitectura-navegacion.md §3).
 * Verifica que el sidebar expone los ítems correctos y oculta los prohibidos.
 */
test.describe('Sidebar — navegación por rol', () => {
  test('planificador: primarios, secciones y sin admin/alertas', async ({ page }) => {
    await ensurePlannerSession(page, '/');
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });

    // Primarios del ciclo planificar → operar → supervisar + Configuración + Evidencias.
    for (const id of ['home', 'planning-weekly', 'optimization', 'monitoring', 'map', 'settings', 'evidence']) {
      await expect(page.getByTestId(`sidebar-nav-${id}`)).toBeVisible();
    }

    // Rutas fuera del menú del planificador.
    await expect(page.getByTestId('sidebar-nav-admin')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-nav-alerts')).toHaveCount(0);

    // Grupos colapsables de la IA. «Tesis y demostración» está oculta del sidebar
    // (`DEMO_NAV_HIDDEN_HREFS`): los módulos siguen accesibles por URL.
    for (const label of ['Consulta y reportes', 'Catálogos']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Tesis y demostración' })).toHaveCount(0);
    for (const id of ['simulation', 'case-studies', 'demostracion']) {
      await expect(page.getByTestId(`sidebar-nav-${id}`)).toHaveCount(0);
    }
  });

  test('conductor: nav reducida de campo', async ({ page }) => {
    await ensureOperatorSession(page, '/operator');
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });

    for (const id of ['operator', 'map', 'alerts']) {
      await expect(page.getByTestId(`sidebar-nav-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('sidebar-nav-settings')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-nav-simulation')).toHaveCount(0);
  });

  test('residente: nav reducida ciudadana', async ({ page }) => {
    await loginResidentFromScratch(page);
    await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 45_000 });

    for (const id of ['resident', 'map', 'collection-points', 'alerts']) {
      await expect(page.getByTestId(`sidebar-nav-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('sidebar-nav-settings')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-nav-optimization')).toHaveCount(0);
  });
});
