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

  it('con `exact` no se activa en subrutas propias del menú', () => {
    // El padre (/settings) no debe resaltarse en la subruta hermana.
    expect(isNavItemActive('/settings', '/settings/calibration', true)).toBe(false);
    expect(isNavItemActive('/settings', '/settings', true)).toBe(true);
    // La subruta sí queda activa en su propia ruta.
    expect(isNavItemActive('/settings/calibration', '/settings/calibration', true)).toBe(true);
    expect(isNavItemActive('/settings/calibration', '/settings')).toBe(false);
  });
});
