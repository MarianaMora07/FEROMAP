import { For, Show, createSignal } from 'solid-js';
import { Badge } from '../../design-system/components';
import { adminMvpTabIds, adminPageMeta, adminTabs, type AdminTabId } from '../../data/mock/admin';
import { AdminAuditLogPanel } from './AdminAuditLogPanel';
import { AdminOperationalSettings } from './AdminOperationalSettings';
import { AdminUsersPanel } from './AdminUsersPanel';

function ComingSoonPanel(props: { title: string }) {
  return (
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center dark:border-dark-border">
      <Badge variant="default" class="mb-3">
        Próximamente
      </Badge>
      <h3 class="font-heading text-lg font-semibold text-text-primary dark:text-white">{props.title}</h3>
      <p class="mt-2 max-w-md text-sm text-text-muted">
        Esta sección estará disponible en una próxima versión. El MVP incluye configuración operativa,
        usuarios y auditoría.
      </p>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = createSignal<AdminTabId>('general');
  const [flash, setFlash] = createSignal<string | null>(null);

  const flashMessage = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((cur) => (cur === message ? null : cur)), 2500);
  };

  const isMvp = (id: AdminTabId) => adminMvpTabIds.has(id);

  const tabLabel = () => adminTabs.find((t) => t.id === tab())?.label ?? '';

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
                  tab() === item.id
                    ? 'text-fero-blue'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {item.label}
                <Show when={!isMvp(item.id)}>
                  <span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-muted dark:bg-dark-surface-hover">
                    Próx.
                  </span>
                </Show>
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
      </Show>

      <Show when={tab() === 'users'}>
        <AdminUsersPanel onFlash={flashMessage} />
      </Show>

      <Show when={tab() === 'audit'}>
        <AdminAuditLogPanel />
      </Show>

      <Show when={!isMvp(tab())}>
        <ComingSoonPanel title={tabLabel()} />
      </Show>
    </div>
  );
}
