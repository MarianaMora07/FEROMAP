import { apiGet, apiPost } from './client';

export interface DriverNotification {
  id: number;
  driverId: number | null;
  vehicleId: number | null;
  channel: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  payload: Record<string, unknown>;
  sentAt: string | null;
  ackAt: string | null;
  createdAt: string | null;
}

export interface OutboxProcessResult {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
}

export function fetchRecentDriverNotifications(limit = 10): Promise<DriverNotification[]> {
  return apiGet(`/api/v1/notifications/drivers/recent?limit=${limit}`);
}

export function ackDriverNotification(notificationId: number): Promise<DriverNotification> {
  return apiPost(`/api/v1/notifications/${notificationId}/ack`, {});
}

export function processNotificationOutbox(): Promise<OutboxProcessResult> {
  return apiPost('/api/v1/notifications/outbox/process', {});
}
