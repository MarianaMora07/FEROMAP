import { describe, expect, it } from 'vitest';
import { DEMO_NAV_HIDDEN_HREFS, sidebarNavLayout } from './permissions';

describe('permissions — demo navigation (B3)', () => {
  it('hides analytics from planner sidebar', () => {
    const layout = sidebarNavLayout('planificador');
    const hrefs = layout.sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).not.toContain('/analytics');
    expect(DEMO_NAV_HIDDEN_HREFS.has('/analytics')).toBe(true);
  });

  it('lists Operación before Análisis in sidebar sections', () => {
    const layout = sidebarNavLayout('planificador');
    expect(layout.sections[0]?.label).toBe('Operación');
    expect(layout.sections[1]?.label).toBe('Análisis');
    expect(layout.sections[0]?.items.map((item) => item.href)).toContain('/planning');
    expect(layout.sections[0]?.items.map((item) => item.href)).toContain('/monitoring');
  });

  it('labels thesis simulation module distinctly', () => {
    const layout = sidebarNavLayout('planificador');
    const analysisItems = layout.sections.find((section) => section.label === 'Análisis')?.items ?? [];
    const simulation = analysisItems.find((item) => item.href === '/simulation');
    expect(simulation?.label).toBe('Simulación de tesis');
    const demo = analysisItems.find((item) => item.href === '/demostracion');
    expect(demo?.label).toBe('Demostración ACO');
  });
});
