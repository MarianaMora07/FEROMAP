import { Show, type JSX } from 'solid-js';
import { settingsPageMeta, settingsSections } from '../../data/mock/settings';
import { SettingsTabs } from './SettingsTabs';

interface SettingsShellProps {
  /** `id` de la sección activa (una por ruta: `/settings`, `/settings/calibration`). */
  active: string;
  /** Aviso efímero bajo las pestañas (lo usa la sección *Algoritmo*). */
  flash?: string | null;
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
        <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          {settingsPageMeta.title}
        </h1>
        <p class="mt-1 text-sm text-text-muted">{settingsPageMeta.subtitle}</p>
      </div>

      <SettingsTabs sections={settingsSections} active={props.active} />

      <Show when={props.flash}>
        <div class="rounded-md border border-fero-green-dark/30 bg-fero-green/10 px-3 py-2 text-sm text-fero-green-dark">
          {props.flash}
        </div>
      </Show>

      {props.children}
    </div>
  );
}
