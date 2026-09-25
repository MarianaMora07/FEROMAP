import { For, Show, createResource, createSignal } from 'solid-js';
import { Check, RefreshCw } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import {
  ackDriverNotification,
  fetchRecentDriverNotifications,
  processNotificationOutbox,
} from '../../core/api/notifications';
import {
  formatNotificationTime,
  notificationChannelLabel,
  notificationEventLabel,
  notificationStatusLabel,
  notificationStatusTone,
} from '../../core/notifications/notificationLabels';

/**
 * Historial y estado de entrega de notificaciones a conductores (F4).
 *
 * No está montado en `/optimization`: el envío es automático (despacho al aprobar la
 * semana + worker de outbox del backend) y el acuse corresponde al conductor en
 * `/operator/notifications`. Se conserva por si se quiere volver a exponer como vista
 * de auditoría de entregas (p. ej. en Historial unificado).
 */
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
          title="Estado de entrega a conductores"
          subtitle="Últimos avisos enviados y su acuse"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy()}
              icon={<RefreshCw size={14} />}
              onClick={() => void retryPending()}
            >
              Reintentar envíos pendientes
            </Button>
          }
        />
        <Show
          when={(notifications() ?? []).length > 0}
          fallback={
            <p class="text-sm text-text-muted">
              {notifications.error
                ? 'No se pudo cargar el historial de notificaciones.'
                : 'Todavía no se han enviado avisos a conductores.'}
            </p>
          }
        >
          <ul class="divide-y divide-default">
            <For each={notifications()}>
              {(notification) => (
                <li class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-1 py-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text-primary dark:text-white">
                      {notificationEventLabel(notification.eventType)}
                    </p>
                    <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                      <span>{formatNotificationTime(notification.sentAt ?? notification.createdAt)}</span>
                      <Show when={notification.payload?.routeId != null}>
                        <span>Ruta #{String(notification.payload.routeId)}</span>
                      </Show>
                      <span>Canal: {notificationChannelLabel(notification.channel)}</span>
                      <Show when={(notification.attempts ?? 0) > 0}>
                        <span>
                          {notification.attempts} {notification.attempts === 1 ? 'intento' : 'intentos'}
                        </span>
                      </Show>
                    </p>
                    <Show when={notification.lastError}>
                      <p class="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {notification.lastError}
                      </p>
                    </Show>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <Badge variant={notificationStatusTone(notification.status)}>
                      {notificationStatusLabel(notification.status)}
                    </Badge>
                    <Show when={notification.status !== 'acked' && notification.status !== 'failed'}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy()}
                        icon={<Check size={14} />}
                        aria-label="Registrar acuse de recibo"
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
