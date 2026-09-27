import { For, Show, createSignal, onMount } from 'solid-js';
import { fetchAdminAuditLog, type AuditLogEntry } from '../../core/api/admin';

function formatAction(entry: AuditLogEntry): string {
  const verbs: Record<string, string> = {
    create: 'Creó',
    update: 'Actualizó',
    delete: 'Eliminó',
  };
  const verb = verbs[entry.action] ?? entry.action;
  return `${verb} ${entry.resource}${entry.resourceId ? ` #${entry.resourceId}` : ''}`;
}

export function AdminAuditLogPanel() {
  const [entries, setEntries] = createSignal<AuditLogEntry[]>([]);
  const [loading, setLoading] = createSignal(true);

  onMount(() => {
    void fetchAdminAuditLog(100)
      .then(setEntries)
      .finally(() => setLoading(false));
  });

  return (
    <div class="space-y-4">
      <div>
        <h3 class="font-heading text-base font-semibold text-text-primary dark:text-white">
          Registro de auditoría
        </h3>
        <p class="text-sm text-text-muted">
          Acciones administrativas recientes sobre usuarios y configuración.
        </p>
      </div>

      <Show when={loading()}>
        <p class="text-sm text-text-muted">Cargando registro...</p>
      </Show>

      <Show when={!loading() && entries().length === 0}>
        <p class="text-sm text-text-muted">No hay eventos registrados todavía.</p>
      </Show>

      <div class="overflow-x-auto rounded-xl border border-border dark:border-dark-border">
        <table class="w-full min-w-160 text-sm">
          <thead>
            <tr class="border-b border-border bg-slate-50/80 text-left text-[10px] uppercase tracking-wide text-text-muted dark:border-dark-border dark:bg-dark-surface-hover">
              <th class="px-3 py-2.5">Fecha</th>
              <th class="px-3 py-2.5">Actor</th>
              <th class="px-3 py-2.5">Acción</th>
              <th class="px-3 py-2.5">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={entries()}>
              {(entry) => (
                <tr>
                  <td class="px-3 py-2.5 text-xs text-text-muted">
                    {new Date(entry.createdAt).toLocaleString('es-VE')}
                  </td>
                  <td class="px-3 py-2.5 text-text-secondary">{entry.actorEmail ?? '—'}</td>
                  <td class="px-3 py-2.5 text-text-primary dark:text-white">{formatAction(entry)}</td>
                  <td class="px-3 py-2.5 text-xs text-text-muted">{entry.ipAddress ?? '—'}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
