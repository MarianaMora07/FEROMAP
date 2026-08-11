import { For, Show, createSignal } from 'solid-js';
import { Badge, Button, Card, CardHeader, TextField } from '../../design-system/components';
import {
  cancelPendingVisit,
  fetchPendingVisits,
  type PendingVisit,
} from '../../core/api/planning';

interface PendingManagementPanelProps {
  operationDate: string;
}

export function PendingManagementPanel(props: PendingManagementPanelProps) {
  const [items, setItems] = createSignal<PendingVisit[]>([]);
  const [status, setStatus] = createSignal('open');
  const [originFrom, setOriginFrom] = createSignal('');
  const [originTo, setOriginTo] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchPendingVisits({
        status: status() || undefined,
        targetDate: props.operationDate,
        originFrom: originFrom() || undefined,
        originTo: originTo() || undefined,
      });
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pendientes');
    } finally {
      setLoading(false);
    }
  };

  void load();

  const handleCancel = async (id: number) => {
    await cancelPendingVisit(id, 'Cancelado desde planificación operativa');
    await load();
  };

  return (
    <Card>
      <CardHeader title="Gestión de pendientes" subtitle="Filtros por estado y fecha de origen" />
      <div class="grid gap-3 md:grid-cols-4">
        <TextField label="Estado" value={status()} onInput={(e) => setStatus(e.currentTarget.value)} />
        <TextField
          label="Origen desde"
          type="date"
          value={originFrom()}
          onInput={(e) => setOriginFrom(e.currentTarget.value)}
        />
        <TextField
          label="Origen hasta"
          type="date"
          value={originTo()}
          onInput={(e) => setOriginTo(e.currentTarget.value)}
        />
        <div class="flex items-end">
          <Button variant="outline" loading={loading()} onClick={() => void load()}>
            Filtrar
          </Button>
        </div>
      </div>
      <Show when={error()}>
        <p class="mt-2 text-sm text-red-500">{error()}</p>
      </Show>
      <ul class="mt-4 space-y-2">
        <For each={items()}>
          {(visit) => (
            <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm dark:border-dark-border">
              <div>
                <span class="font-semibold">{visit.code ?? visit.collectionPointId}</span>
                <span class="ml-2 text-text-muted">
                  origen {visit.originOperationDate} · prioridad {visit.priority}
                </span>
                <Badge variant="info" class="ml-2">
                  {visit.status}
                </Badge>
              </div>
              <Show when={visit.status === 'open'}>
                <Button size="sm" variant="outline" onClick={() => void handleCancel(visit.id)}>
                  Cancelar
                </Button>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
