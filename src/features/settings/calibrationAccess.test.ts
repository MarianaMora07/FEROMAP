import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_ROUTE,
  ROUTE_PERMISSIONS,
  canAccessRoute,
  sidebarNavLayout,
} from '../../core/auth/permissions';
import { en, es } from '../../core/i18n/dictionaries';
import { settingsSections } from '../../data/mock/settings';

describe('calibración del motor — ruta, permisos e i18n (Fase 4)', () => {
  it('solo administrador y planificador acceden a la ruta', () => {
    expect(canAccessRoute('administrador', CALIBRATION_ROUTE)).toBe(true);
    expect(canAccessRoute('planificador', CALIBRATION_ROUTE)).toBe(true);
    expect(canAccessRoute('conductor', CALIBRATION_ROUTE)).toBe(false);
    expect(canAccessRoute('residente', CALIBRATION_ROUTE)).toBe(false);
    expect(canAccessRoute(undefined, CALIBRATION_ROUTE)).toBe(false);
  });

  it('la ruta se declara explícitamente con los mismos roles que /settings', () => {
    expect(ROUTE_PERMISSIONS[CALIBRATION_ROUTE]).toEqual(ROUTE_PERMISSIONS['/settings']);
  });

  it('la sección de Configuración usa claves i18n presentes en ES y EN', () => {
    // La consola es una sección de Configuración (D-C), no un destino del sidebar.
    const primary = sidebarNavLayout('planificador').primary.map((entry) => entry.href);
    expect(primary).not.toContain(CALIBRATION_ROUTE);

    const section = settingsSections.find((entry) => entry.href === CALIBRATION_ROUTE);
    expect(section?.labelKey).toBe('nav.calibration');
    expect(es['nav.calibration']).toBeTruthy();
    expect(en['nav.calibration']).toBeTruthy();
  });

  it('publica el bloque completo de copy de calibración en ambos diccionarios', () => {
    const keys = Object.keys(es).filter((key) => key.startsWith('calibration.'));

    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      expect(es[key as keyof typeof es]).toBeTruthy();
      expect(en[key as keyof typeof en]).toBeTruthy();
    }
    // Los seis ejes del barrido y los tres criterios de aceptación están cubiertos.
    for (const axis of ['ants', 'iterations', 'alpha', 'beta', 'rho', 'q']) {
      expect(es[`calibration.axis.${axis}` as keyof typeof es]).toBeTruthy();
    }
    for (const ac of ['ac1', 'ac2', 'ac3']) {
      expect(es[`calibration.${ac}` as keyof typeof es]).toBeTruthy();
    }
  });

  it('las pestañas de Configuración enlazan Algoritmo y Calibración por ruta', () => {
    expect(settingsSections.map((section) => section.href)).toEqual([
      '/settings',
      CALIBRATION_ROUTE,
    ]);
    expect(settingsSections.map((section) => section.labelKey)).toEqual([
      'settings.section.algorithm',
      'nav.calibration',
    ]);
  });
});
