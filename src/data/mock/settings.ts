import { CALIBRATION_ROUTE } from '../../core/auth/permissions';

export const settingsPageMeta = {
  title: 'Configuración',
  subtitle: 'Parámetros del motor de optimización y preferencias del sistema.',
};

export type SettingsSectionId = 'algorithm' | 'calibration';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  /** Clave i18n de la etiqueta; `label` es el respaldo en español. */
  labelKey: string;
  /** Cada sección es una ruta real: la URL manda sobre el estado local. */
  href: string;
}

/**
 * Secciones de la página Configuración. El motor multiobjetivo (Fase 13) vive en
 * «Algoritmo» y la consola de calibración en `/settings/calibration`; añade aquí
 * nuevas secciones (operativo, integraciones, …) sin tocar el enrutado.
 */
export const settingsSections: SettingsSection[] = [
  {
    id: 'algorithm',
    label: 'Algoritmo',
    labelKey: 'settings.section.algorithm',
    href: '/settings',
  },
  {
    id: 'calibration',
    label: 'Calibración',
    labelKey: 'nav.calibration',
    href: CALIBRATION_ROUTE,
  },
];
