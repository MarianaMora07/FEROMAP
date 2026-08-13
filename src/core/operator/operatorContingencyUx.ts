import type { IncidentPayload } from '../api/contingencies';

export function filterOperatorIncidents(
  incidents: IncidentPayload[],
  vehicleId: string | null | undefined,
  hours = 48,
): IncidentPayload[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return incidents.filter((incident) => {
    if (vehicleId && incident.vehicleId !== vehicleId) return false;
    if (!incident.reportedAt) return true;
    const reported = new Date(incident.reportedAt).getTime();
    if (Number.isNaN(reported)) return true;
    return reported >= cutoff;
  });
}

export function incidentAlertHref(incident: IncidentPayload): string | null {
  if (incident.relatedAlertId) {
    return `/alerts?id=${encodeURIComponent(incident.relatedAlertId)}`;
  }
  return `/alerts?category=mantenimiento&q=${encodeURIComponent(incident.vehicleId)}`;
}

export function formatOperatorIncidentWhen(reportedAt: string | null): string {
  if (!reportedAt) return 'Hoy';
  const date = new Date(reportedAt);
  if (Number.isNaN(date.getTime())) return reportedAt;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `Hoy ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function incidentTypeLabel(type: string): string {
  switch (type) {
    case 'breakdown':
      return 'Avería';
    case 'scheduled_maintenance':
      return 'Mantenimiento';
    default:
      return 'Incidencia';
  }
}
