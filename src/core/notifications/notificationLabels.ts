import type { DriverNotification } from '../api/notifications';

/**
 * Traducciones de presentación para las notificaciones a conductores. El backend
 * guarda tipos de evento y estados en snake_case (`route_dispatched`, `webhook_mock`,
 * `sent`); aquí se convierten a lenguaje del planificador para no filtrar jerga
 * interna a la interfaz.
 */

const EVENT_LABELS: Record<string, string> = {
  route_dispatched: 'Ruta asignada',
  critical_recalc: 'Recálculo de contenedores críticos',
};

/** Etiqueta legible del tipo de evento; si no hay traducción, se limpia el snake_case. */
export function notificationEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ');
}

/**
 * Titular del aviso para el buzón del conductor: usa el mensaje redactado si existe
 * (p. ej. «Ruta #122 asignada — revisa paradas pendientes») y, si no, la etiqueta
 * del evento.
 */
export function driverNotificationHeadline(
  notification: Pick<DriverNotification, 'eventType' | 'payload'>,
): string {
  const message = notification.payload?.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return notificationEventLabel(notification.eventType);
}

/** Fecha/hora corta de una notificación. */
export function formatNotificationTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
