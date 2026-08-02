import { For, Show, createResource } from 'solid-js';
import { AlertTriangle, Wrench } from 'lucide-solid';
import { Card, CardHeader } from '../../design-system/components';
import { fetchRecentIncidents, type IncidentPayload } from '../../core/api/contingencies';
import { canReportBreakdown } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';

function formatIncidentDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function incidentTypeLabel(type: string): string {
  switch (type) {
    case 'breakdown':
      return 'Avería';
    case 'scheduled_maintenance':
      return 'Mantenimiento programado';
    case 'preventive_service':
      return 'Servicio preventivo';
    default:
      return type;
  }
}

function IncidentRow(props: { incident: IncidentPayload }) {
  const incident = () => props.incident;
  return (
    <li class="flex items-start gap-3 border-b border-border py-3 last:border-0 dark:border-dark-border">
      <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40">
        <Wrench size={14} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-text-primary dark:text-white">
          {incidentTypeLabel(incident().incidentType)} — {incident().vehicleId}
        </p>
        <p class="mt-0.5 text-xs text-text-secondary">
          {incident().description ?? 'Sin descripción'}
        </p>
        <p class="mt-1 text-[11px] text-text-muted">
          {formatIncidentDate(incident().reportedAt)}
          {incident().routeId != null ? ` · Ruta #${incident().routeId}` : ''}
          {incident().affectsActiveRoute ? ' · Ruta activa afectada' : ''}
        </p>
      </div>
    </li>
  );
}

interface RecentIncidentsPanelProps {
  compact?: boolean;
  refreshKey?: number;
}

export function RecentIncidentsPanel(props: RecentIncidentsPanelProps) {
  const [incidents, { refetch }] = createResource(
    () => props.refreshKey ?? 0,
    () => fetchRecentIncidents(),
  );

  return (
    <Show when={canReportBreakdown(authUser()?.role)}>
      <Card class={props.compact ? 'border-amber-200/70 dark:border-amber-900/40' : undefined}>
        <CardHeader
          title="Incidentes recientes"
          subtitle="Averías y contingencias reportadas en operación"
        />
        <Show
          when={!incidents.loading}
          fallback={<p class="py-6 text-center text-sm text-text-muted">Cargando incidentes…</p>}
        >
          <Show
            when={!incidents.error}
            fallback={
              <p class="py-4 text-sm text-amber-700">
                No se pudo cargar el historial de incidentes. Verifica tu sesión y permisos.
              </p>
            }
          >
          <Show
            when={(incidents() ?? []).length > 0}
            fallback={
              <div class="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-text-muted dark:border-dark-border">
                <AlertTriangle size={18} class="shrink-0" />
                <span>No hay incidentes recientes registrados.</span>
              </div>
            }
          >
            <ul class="divide-y divide-border dark:divide-dark-border">
              <For each={incidents()}>{(incident) => <IncidentRow incident={incident} />}</For>
            </ul>
          </Show>
          </Show>
        </Show>
        <button
          type="button"
          class="mt-3 text-xs font-semibold text-fero-blue hover:underline"
          onClick={() => void refetch()}
        >
          Actualizar listado
        </button>
      </Card>
    </Show>
  );
}

export { fetchRecentIncidents };
