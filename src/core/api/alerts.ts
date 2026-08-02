import {
  alertsList,
  recentAlertActivity,
} from '../../data/mock/alerts';
import type { AlertCategory, AlertPriority, AlertStatus, SystemAlert } from '../types/alert';
import { apiGet, apiPatch, withMockFallback } from './client';

export type { AlertCategory, AlertPriority, AlertStatus, SystemAlert };

export type AlertLifecycleStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertsStats {
  critical: number;
  warning: number;
  informational: number;
  resolvedToday: number;
  totalActive: number;
}

export interface AlertsResponse {
  alerts: SystemAlert[];
  stats: AlertsStats;
}

export interface AlertActivityItem {
  id: string;
  alertId: string;
  time: string;
  title: string;
  detail: string;
  status: AlertStatus;
}

function mockStatsFromAlerts(alerts: SystemAlert[]): AlertsStats {
  const active = alerts.filter((alert) => alert.status !== 'resuelta');
  return {
    critical: active.filter((alert) => alert.priority === 'critica').length,
    warning: active.filter((alert) => alert.priority === 'advertencia').length,
    informational: active.filter((alert) => alert.priority === 'informativa').length,
    resolvedToday: alerts.filter((alert) => alert.status === 'resuelta').length,
    totalActive: active.length,
  };
}

export function fetchAlerts(): Promise<AlertsResponse> {
  const mockActive = alertsList.filter((alert) => alert.status !== 'resuelta');
  return withMockFallback(
    'alerts',
    () => apiGet<AlertsResponse>('/api/v1/alerts'),
    {
      alerts: mockActive,
      stats: mockStatsFromAlerts(alertsList),
    },
  );
}

export function fetchAlertActivity(): Promise<AlertActivityItem[]> {
  return withMockFallback(
    'alerts-activity',
    () => apiGet<AlertActivityItem[]>('/api/v1/alerts/activity'),
    recentAlertActivity.map((item) => ({
      id: item.id,
      alertId: item.id,
      time: item.time,
      title: item.title,
      detail: item.detail,
      status: item.status,
    })),
  );
}

export async function updateAlertStatus(
  alertId: string,
  status: AlertLifecycleStatus,
): Promise<SystemAlert> {
  return apiPatch<SystemAlert>(`/api/v1/alerts/${alertId}`, { status });
}

export function statsToKpis(stats: AlertsStats) {
  return [
    {
      id: 'critical',
      title: 'Críticas',
      value: stats.critical,
      subtitle: 'Requieren atención inmediata',
      iconTone: 'red' as const,
      icon: 'alert' as const,
    },
    {
      id: 'warning',
      title: 'Advertencias',
      value: stats.warning,
      subtitle: 'Requieren seguimiento',
      iconTone: 'amber' as const,
      icon: 'alert' as const,
    },
    {
      id: 'info',
      title: 'Informativas',
      value: stats.informational,
      subtitle: 'Para tu conocimiento',
      iconTone: 'blue' as const,
      icon: 'info' as const,
    },
    {
      id: 'resolved',
      title: 'Resueltas hoy',
      value: stats.resolvedToday,
      subtitle: 'Alertas atendidas',
      iconTone: 'green' as const,
      icon: 'check' as const,
    },
    {
      id: 'all',
      title: 'Alertas activas',
      value: stats.totalActive,
      subtitle: 'Total en seguimiento',
      iconTone: 'purple' as const,
      icon: 'chart' as const,
    },
  ];
}

export function computeAlertsKpis(alerts: SystemAlert[]) {
  return statsToKpis(mockStatsFromAlerts(alerts));
}

export function computeAlertsDistribution(alerts: SystemAlert[]) {
  const critical = alerts.filter((a) => a.priority === 'critica').length;
  const warning = alerts.filter((a) => a.priority === 'advertencia').length;
  const info = alerts.filter((a) => a.priority === 'informativa').length;
  const total = alerts.length || 1;

  return {
    total: alerts.length,
    items: [
      { label: 'Críticas', count: critical, pct: Math.round((critical / total) * 100), color: '#ef4444' },
      { label: 'Advertencias', count: warning, pct: Math.round((warning / total) * 100), color: '#f59e0b' },
      { label: 'Informativas', count: info, pct: Math.round((info / total) * 100), color: '#1143F3' },
    ],
  };
}

export function computeAlertsByCategory(alerts: SystemAlert[]) {
  const categories: Record<string, { label: string; color: string }> = {
    contenedores: { label: 'Contenedores', color: '#ef4444' },
    trafico: { label: 'Tráfico', color: '#f59e0b' },
    vehiculos: { label: 'Vehículos', color: '#1143F3' },
    mantenimiento: { label: 'Mantenimiento', color: '#7c3aed' },
    sistema: { label: 'Sistema', color: '#64748b' },
  };

  const counts = new Map<string, number>();
  for (const alert of alerts) {
    counts.set(alert.category, (counts.get(alert.category) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([key, count]) => ({
    key,
    label: categories[key]?.label ?? key,
    color: categories[key]?.color ?? '#64748b',
    count,
  }));
}
