import { For, Show, createResource, createSignal } from 'solid-js';
import { Check, RefreshCw } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import {
  ackDriverNotification,
  fetchRecentDriverNotifications,
  processNotificationOutbox,
} from '../../core/api/notifications';

const toneByStatus: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  sent: 'success',
  acked: 'success',
  queued: 'warning',
  pending: 'warning',
  failed: 'danger',
};

/** Historial y estado de entrega de notificaciones a conductores (F4). */
export function NotificationDeliveryPanel() {
  const [refreshToken, setRefreshToken] = createSignal(0);
  const [notifications] = createResource(refreshToken, () =>
    fetchRecentDriverNotifications(8),
  );
  const [busy, setBusy] = createSignal(false);

  const retryPending = async () => {
    setBusy(true);
    try {
      await processNotificationOutbox();
      setRefreshToken((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async (id: number) => {
    setBusy(true);
    try {
      await ackDriverNotification(id);
      setRefreshToken((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="notification-delivery-panel">
      <Card>
        <CardHeader
          title="Historial de notificaciones"
          subtitle="Estado de entrega a conductores"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy()}
              icon={<RefreshCw size={14} />}
              onClick={() => void retryPending()}
            >
              Reintentar
            </Button>
          }
        />
        <Show
          when={(notifications() ?? []).length > 0}
          fallback={
            <p class="text-sm text-text-muted">
              {notifications.error
                ? 'No se pudo cargar el historial de notificaciones.'
                : 'Sin notificaciones recientes.'}
            </p>
          }
        >
          <ul class="space-y-2">
            <For each={notifications()}>
              {(notification) => (
                <li class="flex items-start justify-between gap-3 rounded-lg border border-default px-3 py-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text-primary dark:text-white">
                      {notification.eventType}
                      <Show when={notification.payload?.routeId != null}>
                        {' '}
                        · Ruta {String(notification.payload.routeId)}
                      </Show>
                    </p>
                    <p class="truncate text-xs text-text-muted">
                      Canal {notification.channel} · intentos {notification.attempts}
                      <Show when={notification.lastError}>
                        {' '}
                        · {notification.lastError}
                      </Show>
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <Badge variant={toneByStatus[notification.status] ?? 'info'}>
                      {notification.status}
                    </Badge>
                    <Show when={notification.status !== 'acked' && notification.status !== 'failed'}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy()}
                        icon={<Check size={14} />}
                        onClick={() => void acknowledge(notification.id)}
                      >
                        Acuse
                      </Button>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Card>
    </div>
  );
}
