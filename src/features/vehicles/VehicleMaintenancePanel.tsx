import { For, Show } from 'solid-js';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-solid';
import { Badge } from '../../design-system/components';
import type { VehicleIncident } from '../../core/api/vehicles';

function incidentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    breakdown: 'Avería',
    scheduled_maintenance: 'Mantenimiento programado',
    preventive_service: 'Servicio preventivo',
    maintenance: 'Mantenimiento',
  };
  return labels[type] ?? type.replaceAll('_', ' ');
}

function formatIncidentDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface VehicleMaintenancePanelProps {
  incidents: VehicleIncident[];
  loading?: boolean;
  error?: unknown;
}

export function VehicleMaintenancePanel(props: VehicleMaintenancePanelProps) {
  return (
    <Show
      when={!props.loading}
      fallback={<p class="py-8 text-center text-sm text-text-muted">Cargando historial…</p>}
    >
      <Show
        when={!props.error}
        fallback={
          <p class="py-8 text-center text-sm text-red-600 dark:text-red-400">
            No se pudo cargar el historial de mantenimiento.
          </p>
        }
      >
        <Show
          when={props.incidents.length > 0}
          fallback={
            <div class="py-10 text-center">
              <Wrench size={28} class="mx-auto mb-3 text-text-muted" />
              <p class="text-sm text-text-muted">Sin incidencias ni mantenimientos registrados.</p>
            </div>
          }
        >
          <ul class="space-y-3">
            <For each={props.incidents}>
              {(incident) => (
                <li class="rounded-lg border border-border p-3 dark:border-dark-border">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <span class="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/40">
                      {incident.status === 'resuelto' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    </span>
                    <p class="text-sm font-semibold text-text-primary dark:text-white">
                      {incidentTypeLabel(incident.incidentType)}
                    </p>
                    <Badge variant={incident.status === 'resuelto' ? 'success' : 'warning'} size="sm">
                      {incident.status === 'resuelto' ? 'Resuelto' : 'Activo'}
                    </Badge>
                  </div>
                  <Show when={incident.description}>
                    <p class="text-sm text-text-secondary">{incident.description}</p>
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                    <span>Reportado: {formatIncidentDate(incident.reportedAt)}</span>
                    <Show when={incident.resolvedAt}>
                      <span>Resuelto: {formatIncidentDate(incident.resolvedAt)}</span>
                    </Show>
                    <Show when={incident.affectsActiveRoute}>
                      <span class="text-amber-600">Afectó ruta activa</span>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </Show>
  );
}
