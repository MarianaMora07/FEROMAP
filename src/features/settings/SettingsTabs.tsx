import { For } from 'solid-js';
import { A } from '@solidjs/router';
import { useLocale } from '../../core/i18n/solid';
import type { SettingsSection } from '../../data/mock/settings';

interface SettingsTabsProps {
  sections: SettingsSection[];
  /** `id` de la sección activa (la ruta manda: cada sección es una URL). */
  active: string;
}

/**
 * Pestañas de Configuración. Cada sección es una ruta real (`/settings`,
 * `/settings/calibration`), así que la navegación usa enlaces y `aria-current`.
 */
export function SettingsTabs(props: SettingsTabsProps) {
  const tr = useLocale();

  return (
    <div class="overflow-x-auto border-b border-border dark:border-dark-border">
      <nav
        class="flex min-w-max gap-1"
        aria-label="Secciones de configuración"
        data-testid="settings-sections"
      >
        <For each={props.sections}>
          {(item) => (
            <A
              href={item.href}
              aria-current={props.active === item.id ? 'page' : undefined}
              data-testid={`settings-section-${item.id}`}
              class={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fero-blue ${
                props.active === item.id
                  ? 'text-fero-blue'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tr(item.labelKey, item.label)}
              {props.active === item.id && (
                <span class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fero-blue" />
              )}
            </A>
          )}
        </For>
      </nav>
    </div>
  );
}
