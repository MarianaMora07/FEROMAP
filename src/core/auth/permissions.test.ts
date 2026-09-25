import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_ROUTE,
  DEMO_NAV_HIDDEN_HREFS,
  MAIN_NAV_ITEMS,
  RESIDENT_BOTTOM_NAV_ITEMS,
  canEnsureDailyPlan,
  sidebarNavLayout,
} from './permissions';

const TESIS_HREFS = ['/simulation', '/case-studies', '/demostracion'];

describe('permissions — arquitectura de navegación (IA)', () => {
  it('exposes analytics in the planner sidebar (F6)', () => {
    const layout = sidebarNavLayout('planificador');
    const hrefs = layout.sections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain('/analytics');
    expect(DEMO_NAV_HIDDEN_HREFS.has('/analytics')).toBe(false);
  });

  it('orders planner primaries as planificar → operar → supervisar', () => {
    const layout = sidebarNavLayout('planificador');
    // El ciclo operativo (planificar → operar → supervisar), «Configuración»
    // (que agrupa Algoritmo y Calibración) y «Evidencias» (tablas del capítulo)
    // cierran la lista.
    expect(layout.primary.map((item) => item.href)).toEqual([
      '/',
      '/planning/weekly',
      '/optimization',
      '/monitoring',
      '/map',
      '/settings',
      '/evidence',
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

  it('no expone la calibración del motor como destino del sidebar (Fase 13)', () => {
    // La consola vive como sección de Configuración (decisión D-C), así que el
    // destino del sidebar es `/settings`, que permanece activo en la subruta.
    const primary = sidebarNavLayout('administrador').primary.map((item) => item.href);
    expect(primary).toContain('/settings');
    expect(primary).not.toContain(CALIBRATION_ROUTE);
  });

  it('groups sections as Consulta y reportes y Catálogos (tesis oculta)', () => {
    const layout = sidebarNavLayout('planificador');
    expect(layout.sections.map((section) => section.label)).toEqual([
      'Consulta y reportes',
      'Catálogos',
    ]);

    const [reportes, catalogos] = layout.sections;
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

  it('oculta los módulos de tesis del sidebar sin retirar sus rutas', () => {
    const layout = sidebarNavLayout('planificador');
    const hrefs = [
      ...layout.primary.map((item) => item.href),
      ...layout.sections.flatMap((section) => section.items.map((item) => item.href)),
    ];
    expect(layout.sections.some((section) => section.label === 'Tesis y demostración')).toBe(false);
    for (const href of TESIS_HREFS) {
      expect(DEMO_NAV_HIDDEN_HREFS.has(href)).toBe(true);
      expect(hrefs).not.toContain(href);
      // Siguen definidos como destinos del rol (accesibles por URL, solo no listados).
      expect(MAIN_NAV_ITEMS.some((item) => item.href === href)).toBe(true);
    }
  });

  it('labels thesis simulation module distinctly', () => {
    const simulation = MAIN_NAV_ITEMS.find((item) => item.href === '/simulation');
    expect(simulation?.label).toBe('Simulación ACO (tesis)');
    const demo = MAIN_NAV_ITEMS.find((item) => item.href === '/demostracion');
    expect(demo?.label).toBe('Demostración ACO');
  });

  it('marca los módulos de tesis con kind demo (badge solo admin)', () => {
    const demoItems = MAIN_NAV_ITEMS.filter((item) => TESIS_HREFS.includes(item.href));
    expect(demoItems).toHaveLength(3);
    expect(demoItems.every((item) => item.kind === 'demo')).toBe(true);
    const planSemanal = MAIN_NAV_ITEMS.find((item) => item.href === '/planning/weekly');
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

  it('solo admin y planificador pueden asegurar el plan del día', () => {
    expect(canEnsureDailyPlan('administrador')).toBe(true);
    expect(canEnsureDailyPlan('planificador')).toBe(true);
    expect(canEnsureDailyPlan('conductor')).toBe(false);
    expect(canEnsureDailyPlan('residente')).toBe(false);
    expect(canEnsureDailyPlan(undefined)).toBe(false);
  });

  it('expone bottom nav móvil del residente (5 destinos)', () => {
    expect(RESIDENT_BOTTOM_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/resident',
      '/map?scope=sector',
      '/collection-points',
      '/alerts?scope=sector',
      '/profile',
    ]);
  });
});
