import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensurePlannerSession, expectNoPageErrors } from './helpers/planner-session';

/**
 * Auditoría de accesibilidad (axe) en las rutas clave del planificador.
 *
 * Criterio de aceptación (docs/design-system/contratos-ui.md §4): **0 violaciones
 * `critical`/`serious`**; las `moderate`/`minor` se registran como backlog.
 *
 * Las capas del mapa (maplibre-gl) son de terceros y se excluyen del barrido para
 * no apuntar a sus controles internos; el chrome propio sí se audita.
 */
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

interface PlanRoute {
  path: string;
  /** Testid o texto que confirma que la vista terminó de montar. */
  anchor: { kind: 'testid'; value: string } | { kind: 'text'; value: string };
}

const ROUTES: PlanRoute[] = [
  { path: '/', anchor: { kind: 'testid', value: 'planner-hub' } },
  { path: '/planning/weekly', anchor: { kind: 'testid', value: 'planning-weekly-page' } },
  { path: '/optimization', anchor: { kind: 'testid', value: 'optimization-sticky-toolbar' } },
  { path: '/monitoring', anchor: { kind: 'testid', value: 'monitoring-tabs' } },
  { path: '/map', anchor: { kind: 'testid', value: 'map-layers-panel' } },
  { path: '/settings', anchor: { kind: 'testid', value: 'settings-sections' } },
  { path: '/reports', anchor: { kind: 'testid', value: 'reports-page' } },
  { path: '/analytics', anchor: { kind: 'testid', value: 'analytics-page' } },
  {
    path: '/planning/history',
    anchor: { kind: 'text', value: 'Historial unificado de planificación' },
  },
];

async function waitForAnchor(page: Page, anchor: PlanRoute['anchor']) {
  if (anchor.kind === 'testid') {
    await expect(page.getByTestId(anchor.value)).toBeVisible({ timeout: 45_000 });
  } else {
    await expect(page.getByText(anchor.value).first()).toBeVisible({ timeout: 45_000 });
  }
}

for (const route of ROUTES) {
  test(`axe · sin violaciones bloqueantes en ${route.path}`, async ({ page }) => {
    expectNoPageErrors(page);
    await ensurePlannerSession(page, route.path);
    await waitForAnchor(page, route.anchor);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('.maplibregl-control-container')
      .exclude('canvas')
      .analyze();

    const blocking = results.violations.filter((violation) =>
      BLOCKING_IMPACTS.has(violation.impact ?? ''),
    );

    if (blocking.length > 0) {
      const summary = blocking
        .map((v) => `· [${v.impact}] ${v.id} (${v.nodes.length}) — ${v.help}`)
        .join('\n');
      throw new Error(`Violaciones axe critical/serious en ${route.path}:\n${summary}`);
    }
  });
}
