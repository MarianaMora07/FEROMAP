import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button, Card, CardHeader, TextField } from '../../design-system/components';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';
import {
  cancelBulkPendingVisits,
  cancelPendingVisit,
  fetchPendingVisits,
  resolvePendingVisit,
  type PendingVisit,
} from '../../core/api/planning';

interface PendingManagementPanelProps {
  operationDate: string;
  /** Sin card exterior cuando va dentro de un panel colapsable */
  embedded?: boolean;
}

function originDaysAgo(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return 0;
  const origin = new Date(year, month - 1, day);
  const today = new Date();
  const diff = today.getTime() - origin.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function PendingManagementPanel(props: PendingManagementPanelProps) {
  const [items, setItems] = createSignal<PendingVisit[]>([]);
  const [status, setStatus] = createSignal('open');
  const [originFrom, setOriginFrom] = createSignal('');
  const [originTo, setOriginTo] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [acting, setActing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [resultMessage, setResultMessage] = createSignal<string | null>(null);

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

  createEffect(() => {
    props.operationDate;
    void load();
  });

  /** Pendientes viejos (sin fecha objetivo, abiertos, origen > 30 días). */
  const oldOpenIds = createMemo(() =>
    items()
      .filter(
        (visit) =>
          visit.status === 'open' &&
          !visit.targetOperationDate &&
          originDaysAgo(visit.originOperationDate) > 30,
      )
      .map((visit) => visit.id),
  );

  const runAction = async (action: () => Promise<void>) => {
    setActing(true);
    setError(null);
    setResultMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async (id: number) =>
    runAction(async () => {
      await cancelPendingVisit(id, 'Cancelado desde planificación operativa');
      setResultMessage('Pendiente cancelado.');
      await load();
    });

  const handleResolve = async (id: number) =>
    runAction(async () => {
      await resolvePendingVisit(id);
      setResultMessage('Pendiente marcado como ya visitado.');
      await load();
    });

  const handleCancelOld = async () =>
    runAction(async () => {
      const result = await cancelBulkPendingVisits({ pendingIds: oldOpenIds() });
      if (result.cancelled > 0) {
        setResultMessage(
          `${result.cancelled} pendiente${result.cancelled === 1 ? '' : 's'} antiguo${result.cancelled === 1 ? '' : 's'} cancelado${result.cancelled === 1 ? '' : 's'}.`,
        );
      } else {
        setResultMessage('No había pendientes antiguos que cancelar.');
      }
      await load();
    });

  const body = (
    <>
      <div class="flex flex-wrap items-end gap-2">
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
        <Button variant="outline" loading={loading()} onClick={() => void load()}>
          Filtrar
        </Button>
        <Show when={oldOpenIds().length > 0}>
          <Button
            variant="outline"
            loading={acting()}
            data-testid="pending-cancel-old"
            onClick={() => void handleCancelOld()}
          >
            Cancelar antiguos (&gt;30 días, sin fecha)
          </Button>
        </Show>
      </div>
      <Show when={error()}>
        <p class="mt-2 text-sm text-red-500">{error()}</p>
      </Show>
      <Show when={resultMessage()}>
        <p class="mt-2 text-sm font-medium text-fero-green-dark" role="status">
          {resultMessage()}
        </p>
      </Show>
      <Show when={items().length === 0 && !loading()}>
        <p class="mt-4 text-sm text-text-muted">No hay pendientes para esta fecha.</p>
      </Show>
      <ul class="mt-4 space-y-2">
        <For each={items()}>
          {(visit) => (
            <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default px-3 py-2 text-sm">
              <div>
                <span class="font-semibold">{visit.code ?? visit.collectionPointId}</span>
                <span class="ml-2 text-text-muted">
                  origen {visit.originOperationDate} · prioridad {visit.priority}
                </span>
                <PlanningStatusBadge status={visit.status} class="ml-2" />
                <Show when={originDaysAgo(visit.originOperationDate) > 30}>
                  <span class="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    antiguo
                  </span>
                </Show>
              </div>
              <Show when={visit.status === 'open'}>
                <div class="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={acting()}
                    data-testid={`pending-resolve-${visit.id}`}
                    onClick={() => void handleResolve(visit.id)}
                  >
                    Ya visitado
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={acting()}
                    onClick={() => void handleCancel(visit.id)}
                  >
                    Cancelar
                  </Button>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </>
  );

  if (props.embedded) {
    return <div data-testid="pending-management-panel">{body}</div>;
  }

  return (
    <div id="pendientes">
      <Card>
        <CardHeader
          title="Gestión de pendientes"
          subtitle={`Carry-over y visitas para el ${props.operationDate}`}
        />
        {body}
      </Card>
    </div>
  );
}
