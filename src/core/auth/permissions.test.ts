import { describe, expect, it } from 'vitest';
import { DEMO_NAV_HIDDEN_HREFS, sidebarNavLayout } from './permissions';

describe('permissions — arquitectura de navegación (IA)', () => {
  it('exposes analytics in the planner sidebar (F6)', () => {
    const layout = sidebarNavLayout('planificador');
    const hrefs = layout.sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain('/analytics');
    expect(DEMO_NAV_HIDDEN_HREFS.has('/analytics')).toBe(false);
  });

  it('orders planner primaries as planificar → operar → supervisar', () => {
    const layout = sidebarNavLayout('planificador');
    // El ciclo operativo (planificar → operar → supervisar) se mantiene como prefijo;
    // «Configuración» es un destino de sistema y se añade al final.
    expect(layout.primary.map((item) => item.href)).toEqual([
      '/',
      '/planning/weekly',
      '/optimization',
      '/monitoring',
      '/map',
      '/settings',
    ]);
  });

  it('expone Configuración al planificador y al admin, no al conductor', () => {
    const planner = sidebarNavLayout('planificador').primary.find((item) => item.href === '/settings');
    expect(planner?.label).toBe('Configuración');
    expect(planner?.sidebarPrimary).toBe(true);

    const admin = sidebarNavLayout('administrador').primary.map((item) => item.href);
    expect(admin).toContain('/settings');

    const driver = sidebarNavLayout('conductor').primary.map((item) => item.href);
    expect(driver).not.toContain('/settings');
  });

  it('groups sections as Consulta y reportes, Catálogos, Tesis y demostración', () => {
    const layout = sidebarNavLayout('planificador');
    expect(layout.sections.map((section) => section.label)).toEqual([
      'Consulta y reportes',
      'Catálogos',
      'Tesis y demostración',
    ]);

    const [reportes, catalogos, tesis] = layout.sections;
    expect(reportes.items.map((item) => item.href)).toEqual([
      '/planning/history',
      '/reports',
      '/analytics',
    ]);
    expect(catalogos.items.map((item) => item.href)).toEqual([
      '/vehicles',
      '/drivers',
      '/collection-points',
    ]);
    expect(tesis.items.map((item) => item.href)).toEqual([
      '/simulation',
      '/case-studies',
      '/demostracion',
    ]);
  });

  it('removes hub, levels y alertas del menú del planificador (Fase 1)', () => {
    const layout = sidebarNavLayout('planificador');
    const hrefs = [
      ...layout.primary.map((item) => item.href),
      ...layout.sections.flatMap((section) => section.items.map((item) => item.href)),
    ];
    expect(hrefs).not.toContain('/planning');
    expect(hrefs).not.toContain('/optimization/levels');
    expect(hrefs).not.toContain('/alerts');
  });

  it('labels thesis simulation module distinctly', () => {
    const layout = sidebarNavLayout('planificador');
    const tesisItems = layout.sections.find((section) => section.label === 'Tesis y demostración')?.items ?? [];
    const simulation = tesisItems.find((item) => item.href === '/simulation');
    expect(simulation?.label).toBe('Simulación ACO');
    const demo = tesisItems.find((item) => item.href === '/demostracion');
    expect(demo?.label).toBe('Demostración ACO');
  });

  it('marca los módulos de tesis con kind demo (badge solo admin)', () => {
    const layout = sidebarNavLayout('planificador');
    const tesisItems = layout.sections.find((section) => section.label === 'Tesis y demostración')?.items ?? [];
    expect(tesisItems.every((item) => item.kind === 'demo')).toBe(true);
    const planSemanal = layout.primary.find((item) => item.href === '/planning/weekly');
    expect(planSemanal?.kind).toBeUndefined(); // 'producto' es el valor por defecto al renderizar
  });

  it('keeps alertas en la nav de conductor y residente', () => {
    const operator = sidebarNavLayout('conductor');
    const operatorHrefs = [
      ...operator.primary.map((item) => item.href),
      ...operator.sections.flatMap((section) => section.items.map((item) => item.href)),
    ];
    expect(operatorHrefs).toContain('/alerts');
    expect(operatorHrefs).not.toContain('/simulation');

    const resident = sidebarNavLayout('residente');
    const residentHrefs = [
      ...resident.primary.map((item) => item.href),
      ...resident.sections.flatMap((section) => section.items.map((item) => item.href)),
    ];
    expect(residentHrefs).toContain('/alerts?scope=sector');
    expect(residentHrefs).not.toContain('/simulation');
  });
});
