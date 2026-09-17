export const settingsPageMeta = {
  title: 'Configuración',
  subtitle: 'Parámetros del motor de optimización y preferencias del sistema.',
};

export type SettingsSectionId = 'algorithm';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
}

/**
 * Secciones de la página Configuración. El motor multiobjetivo (Fase 13) vive en
 * «Algoritmo»; añade aquí nuevas secciones (operativo, integraciones, …) sin tocar
 * el enrutado.
 */
export const settingsSections: SettingsSection[] = [
  { id: 'algorithm', label: 'Algoritmo' },
];
