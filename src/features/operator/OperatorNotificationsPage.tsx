import { For, Show, createResource, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { Bell, Check, Inbox } from 'lucide-solid';
import { Badge, Button, Card, CardHeader, LoadingPanel } from '../../design-system/components';
import { ackDriverNotification, fetchRecentDriverNotifications } from '../../core/api/notifications';
import {
  driverNotificationHeadline,
  formatNotificationTime,
} from '../../core/notifications/notificationLabels';
import { globalToast } from '../../core/stores/toastStore';

export default function OperatorNotificationsPage() {
  const [version, setVersion] = createSignal(0);
  const [items] = createResource(version, () => fetchRecentDriverNotifications(30));
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const ack = async (id: number) => {
    if (busyId() != null) return;
    setBusyId(id);
    try {
      await ackDriverNotification(id);
      setVersion((v) => v + 1);
    } catch (error) {
      globalToast.addToast(
        error instanceof Error ? error.message : 'No se pudo acusar',
        'error',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div class="space-y-4" data-testid="operator-notifications">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Campo
          </p>
          <h1 id="page-title" class="font-heading text-xl font-bold text-text-primary dark:text-white">
            Notificaciones
          </h1>
          <p class="mt-1 text-sm text-text-secondary">
            Avisos de despacho y operación. Acusa para dejar constancia de recepción.
          </p>
        </div>
        <A href="/operator" class="text-sm font-medium text-fero-blue hover:underline">
          Volver a mi operación
        </A>
      </div>

      <Card>
        <CardHeader
          title="Bandeja"
          subtitle="Tus notificaciones recientes"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersion((v) => v + 1)}
              disabled={items.loading}
            >
              Actualizar
            </Button>
          }
        />
        <Show when={items.loading}>
          <LoadingPanel label="Cargando notificaciones…" indeterminate />
        </Show>
        <Show when={!items.loading && (items() ?? []).length === 0}>
          <div class="flex flex-col items-center gap-2 py-8 text-center" data-testid="notifications-empty">
            <Inbox size={28} class="text-text-muted" aria-hidden="true" />
            <p class="font-semibold text-text-primary dark:text-white">Sin notificaciones</p>
            <p class="text-sm text-text-secondary">
              Cuando planificación despache tu ruta recibirás un aviso aquí.
            </p>
          </div>
        </Show>
        <Show when={!items.loading && (items() ?? []).length > 0}>
          <ul class="divide-y divide-border" data-testid="notifications-list">
            <For each={items()}>
              {(n) => (
                <li class="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <Bell size={14} class="shrink-0 text-fero-blue" aria-hidden="true" />
                      <p class="font-semibold text-text-primary dark:text-white">{driverNotificationHeadline(n)}</p>
                      <Badge
                        variant={n.ackAt ? 'success' : n.status === 'failed' ? 'danger' : 'info'}
                        class="shrink-0"
                      >
                        {n.ackAt ? 'Acusada' : n.status === 'failed' ? 'Fallida' : n.status === 'sent' ? 'Entregada' : 'En cola'}
                      </Badge>
                    </div>
                    <p class="mt-0.5 text-xs text-text-muted">
                      {formatNotificationTime(n.sentAt ?? n.createdAt)}
                      <Show when={n.vehicleId != null}> · vehículo #{n.vehicleId}</Show>
                    </p>
                  </div>
                  <Show when={!n.ackAt}>
                    <Button
                      variant="outline"
                      size="sm"
                      class="min-h-11 shrink-0 gap-2"
                      disabled={busyId() === n.id}
                      data-testid={`notification-ack-${n.id}`}
                      onClick={() => void ack(n.id)}
                    >
                      <Check size={14} />
                      Acusar recibo
                    </Button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Card>
    </div>
  );
}
