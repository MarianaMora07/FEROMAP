import { For, Show, createSignal } from 'solid-js';
import {
  settingsPageMeta,
  settingsSections,
  type SettingsSectionId,
} from '../../data/mock/settings';
import { AlgorithmSettingsPanel } from './AlgorithmSettingsPanel';

/**
 * Página «Configuración» (sidebar).
 *
 * Centraliza los parámetros del sistema. Hoy contiene la sección **Algoritmo**
 * (motor ACO y objetivo multiobjetivo, Fase 13); antes vivía como pestaña dentro
 * de *Plan del día*.
 */
export default function SettingsPage() {
  const [section, setSection] = createSignal<SettingsSectionId>('algorithm');
  const [flash, setFlash] = createSignal<string | null>(null);

  const flashMessage = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((current) => (current === message ? null : current)), 2500);
  };

  return (
    <div class="space-y-5">
      <div>
        <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          {settingsPageMeta.title}
        </h1>
        <p class="mt-1 text-sm text-text-muted">{settingsPageMeta.subtitle}</p>
      </div>

      <div class="overflow-x-auto border-b border-border dark:border-dark-border">
        <nav
          class="flex min-w-max gap-1"
          aria-label="Secciones de configuración"
          data-testid="settings-sections"
        >
          <For each={settingsSections}>
            {(item) => (
              <button
                type="button"
                role="tab"
                aria-selected={section() === item.id}
                data-testid={`settings-section-${item.id}`}
                onClick={() => setSection(item.id)}
                class={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  section() === item.id ? 'text-fero-blue' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {item.label}
                <Show when={section() === item.id}>
                  <span class="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fero-blue" />
                </Show>
              </button>
            )}
          </For>
        </nav>
      </div>

      <Show when={flash()}>
        <div class="rounded-md border border-fero-green-dark/30 bg-fero-green/10 px-3 py-2 text-sm text-fero-green-dark">
          {flash()}
        </div>
      </Show>

      <Show when={section() === 'algorithm'}>
        <AlgorithmSettingsPanel onFlash={flashMessage} />
      </Show>
    </div>
  );
}
