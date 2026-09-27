import { type JSX } from 'solid-js';
import { settingsPageMeta, settingsSections } from '../../data/mock/settings';
import { SettingsTabs } from './SettingsTabs';

interface SettingsShellProps {
  /** `id` de la sección activa (una por ruta: `/settings`, `/settings/calibration`). */
  active: string;
  testId?: string;
  children: JSX.Element;
}

/**
 * Marco común de Configuración: título, pestañas por ruta y contenido de la sección.
 *
 * Las dos rutas comparten el mismo chrome para que la navegación no cambie de aspecto al
 * movernos entre secciones; la sección aporta su propio encabezado y contenido.
 */
export function SettingsShell(props: SettingsShellProps) {
  return (
    <div class="space-y-5" data-testid={props.testId}>
      <div>
        <h2 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          {settingsPageMeta.title}
        </h2>
        <p class="mt-1 text-sm text-text-muted">{settingsPageMeta.subtitle}</p>
      </div>

      <SettingsTabs sections={settingsSections} active={props.active} />

      {props.children}
    </div>
  );
}
