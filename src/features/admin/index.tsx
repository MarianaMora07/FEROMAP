import { For, Show, createSignal } from 'solid-js';
import { adminPageMeta, adminTabs, type AdminTabId } from '../../data/mock/admin';
import { AdminAuditLogPanel } from './AdminAuditLogPanel';
import { AdminOperationalSettings } from './AdminOperationalSettings';
import { AdminUsersPanel } from './AdminUsersPanel';
import { AdminZonesPanel } from './AdminZonesPanel';

export default function AdminPage() {
  const [tab, setTab] = createSignal<AdminTabId>('general');
  const [flash, setFlash] = createSignal<string | null>(null);

  const flashMessage = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((cur) => (cur === message ? null : cur)), 2500);
  };

  return (
    <div class="space-y-5">
      <div>
        <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">
          {adminPageMeta.title}
        </h1>
        <p class="mt-1 text-sm text-text-muted">{adminPageMeta.subtitle}</p>
      </div>

      <div class="overflow-x-auto border-b border-border dark:border-dark-border">
        <nav class="flex min-w-max gap-1" aria-label="Secciones de administración">
          <For each={adminTabs}>
            {(item) => (
              <button
                type="button"
                onClick={() => setTab(item.id)}
                class={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab() === item.id ? 'text-fero-blue' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {item.label}
                <Show when={tab() === item.id}>
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

      <Show when={tab() === 'general'}>
        <AdminOperationalSettings onFlash={flashMessage} />
        <AdminZonesPanel onFlash={flashMessage} />
      </Show>

      <Show when={tab() === 'users'}>
        <AdminUsersPanel onFlash={flashMessage} />
      </Show>

      <Show when={tab() === 'audit'}>
        <AdminAuditLogPanel />
      </Show>
    </div>
  );
}
