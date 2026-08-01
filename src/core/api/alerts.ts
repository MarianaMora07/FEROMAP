import {
  alertsList,
  type AlertCategory,
  type AlertPriority,
  type AlertStatus,
  type SystemAlert,
} from '../../data/mock/alerts';
import { apiGet, withMockFallback } from './client';

export type { AlertCategory, AlertPriority, AlertStatus, SystemAlert };

export function fetchAlerts(): Promise<SystemAlert[]> {
  return withMockFallback(
    'alerts',
    () => apiGet<SystemAlert[]>('/api/v1/alerts'),
    alertsList,
  );
}

export function computeAlertsKpis(alerts: SystemAlert[]) {
  const critical = alerts.filter((a) => a.priority === 'critica').length;
  const warning = alerts.filter((a) => a.priority === 'advertencia').length;
  const info = alerts.filter((a) => a.priority === 'informativa').length;
  const resolved = alerts.filter((a) => a.status === 'resuelta').length;

  return [
    {
      id: 'critical',
      title: 'Críticas',
      value: critical,
      subtitle: 'Requieren atención inmediata',
      iconTone: 'red' as const,
      icon: 'alert' as const,
    },
    {
      id: 'warning',
      title: 'Advertencias',
      value: warning,
      subtitle: 'Requieren seguimiento',
      iconTone: 'amber' as const,
      icon: 'alert' as const,
    },
    {
      id: 'info',
      title: 'Informativas',
      value: info,
      subtitle: 'Para tu conocimiento',
      iconTone: 'blue' as const,
      icon: 'info' as const,
    },
    {
      id: 'resolved',
      title: 'Resueltas hoy',
      value: resolved,
      subtitle: 'Alertas atendidas',
      iconTone: 'green' as const,
      icon: 'check' as const,
    },
    {
      id: 'all',
      title: 'Todas las alertas',
      value: alerts.length,
      subtitle: 'Total registradas',
      iconTone: 'purple' as const,
      icon: 'chart' as const,
    },
  ];
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
