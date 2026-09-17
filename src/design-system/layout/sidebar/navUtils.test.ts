import { describe, expect, it } from 'vitest';
import { isNavItemActive, navHrefPath } from './navUtils';

describe('navUtils — ítem activo del sidebar', () => {
  it('marca la ruta exacta y sus subrutas', () => {
    expect(isNavItemActive('/map', '/map')).toBe(true);
    expect(isNavItemActive('/case-studies', '/case-studies/7')).toBe(true);
    expect(isNavItemActive('/case-studies', '/analytics')).toBe(false);
  });

  it('ignora la query en el href (`/map?scope=sector`)', () => {
    expect(navHrefPath('/map?scope=sector')).toBe('/map');
    expect(isNavItemActive('/map?scope=sector', '/map')).toBe(true);
  });

  it('mantiene activo el ítem padre en subrutas propias de su página', () => {
    // «Configuración» sigue resaltada en su sección de calibración.
    expect(isNavItemActive('/settings', '/settings/calibration')).toBe(true);
    expect(isNavItemActive('/settings', '/settings')).toBe(true);
  });
});
