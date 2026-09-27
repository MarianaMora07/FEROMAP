import { For, Show, createResource, createSignal } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, History } from 'lucide-solid';
import { Card, CardHeader } from '../../design-system/components';
import { fetchRecentIncidents, type IncidentPayload } from '../../core/api/contingencies';
import { fetchIncidentTrace } from '../../core/api/planningAnalytics';
import { optimizationHref } from '../../core/planning/operationalLinks';
import { planningHistoryHref } from '../../core/planning/planningHistoryLinks';
import { canReportBreakdown } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';

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

function IncidentTraceInline(props: { incidentId: number }) {
  const [trace] = createResource(() => props.incidentId, fetchIncidentTrace);

  return (
    <Show
      when={!trace.loading}
      fallback={<p class="mt-2 text-xs text-text-muted">Cargando trazabilidad…</p>}
    >
      <Show
        when={trace() && trace()!.pendingVisits.length > 0}
        fallback={<p class="mt-2 text-xs text-text-muted">Sin pendientes vinculados a esta incidencia.</p>}
      >
        <ul class="mt-2 space-y-2">
          <For each={trace()!.pendingVisits}>
            {(link) => {
              const pending = () => link.pendingVisit as Record<string, unknown>;
              const nextPlan = () => link.nextDailyPlan as Record<string, unknown> | null;
              return (
                <li class="rounded-md border border-border bg-surface/50 px-2.5 py-2 text-xs dark:border-dark-border">
                  <div class="flex flex-wrap items-center gap-1 font-medium text-text-secondary">
                    <span>Pendiente {String(pending().code ?? pending().id ?? '—')}</span>
                    <ArrowRight size={12} />
                    <span>Plan {link.targetOperationDate}</span>
                  </div>
                  <p class="mt-1 text-text-muted">
                    Origen {String(pending().originOperationDate ?? '—')} ·{' '}
                    {String(pending().reason ?? '—')}
                  </p>
                  <Show when={nextPlan()}>
                    <PlanningStatusBadge
                      status={String(nextPlan()!.status ?? 'draft')}
                      class="mt-1"
                    />
                  </Show>
                  <A
                    href={optimizationHref({
                      date: link.targetOperationDate,
                      dailyPlanId:
                        typeof nextPlan()?.id === 'number' ? (nextPlan()!.id as number) : undefined,
                    })}
                    class="mt-1 inline-block font-semibold text-fero-blue hover:underline"
                  >
                    Ir al plan del día
                  </A>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </Show>
  );
}

function IncidentRow(props: { incident: IncidentPayload }) {
  const incident = () => props.incident;
  const [expanded, setExpanded] = createSignal(false);

  return (
    <li class="border-b border-border py-3 last:border-0 dark:border-dark-border">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40">
          <AlertTriangle size={14} />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-text-primary dark:text-white">
            #{incident().id} · {incidentTypeLabel(incident().incidentType)} — {incident().vehicleId}
          </p>
          <p class="mt-0.5 text-xs text-text-secondary">
            {incident().description ?? 'Sin descripción'}
          </p>
          <p class="mt-1 text-[11px] text-text-muted">
            {formatIncidentDate(incident().reportedAt)}
            {incident().routeId != null ? ` · Ruta #${incident().routeId}` : ''}
            {incident().affectsActiveRoute ? ' · Ruta activa afectada' : ''}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-1 text-[11px] font-semibold text-fero-green-dark hover:underline"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded() ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded() ? 'Ocultar trazabilidad' : 'Ver trazabilidad inline'}
            </button>
            <A
              href={planningHistoryHref({ incidentId: incident().id })}
              class="inline-flex items-center gap-1 text-[11px] font-semibold text-fero-blue hover:underline"
            >
              <History size={12} />
              Historial unificado
            </A>
          </div>
          <Show when={expanded()}>
            <IncidentTraceInline incidentId={incident().id} />
          </Show>
        </div>
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
          title="Incidentes y trazabilidad"
          subtitle="Supervisión — incidencia → pendiente → plan del día siguiente"
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
              <ul>
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
