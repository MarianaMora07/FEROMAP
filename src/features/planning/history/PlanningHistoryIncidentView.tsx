import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { Card, CardHeader } from '../../../design-system/components';
import type { IncidentTrace } from '../../../core/api/planningAnalytics';
import { optimizationDateHref } from '../../../core/planning/planningUx';
import { PlanningStatusBadge } from '../PlanningStatusBadge';

interface PlanningHistoryIncidentViewProps {
  trace: IncidentTrace;
}

function incidentTypeLabel(type: string): string {
  switch (type) {
    case 'breakdown':
      return 'Avería';
    case 'scheduled_maintenance':
      return 'Mantenimiento programado';
    default:
      return type;
  }
}

export function PlanningHistoryIncidentView(props: PlanningHistoryIncidentViewProps) {
  const incident = () => props.trace.incident;

  return (
    <div class="space-y-4">
      <Card>
        <CardHeader title={`Incidencia #${incident().id}`} subtitle="Trazabilidad operativa" />
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-text-muted">Tipo</dt>
            <dd class="font-semibold text-text-primary dark:text-white">
              {incidentTypeLabel(incident().incidentType)}
            </dd>
          </div>
          <div>
            <dt class="text-text-muted">Vehículo</dt>
            <dd class="font-semibold text-text-primary dark:text-white">{incident().vehicleId ?? '—'}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-text-muted">Descripción</dt>
            <dd class="text-text-secondary">{incident().description ?? 'Sin descripción'}</dd>
          </div>
          <div>
            <dt class="text-text-muted">Reportada</dt>
            <dd class="text-text-secondary">{incident().reportedAt ?? '—'}</dd>
          </div>
          <div>
            <dt class="text-text-muted">Ruta</dt>
            <dd class="text-text-secondary">
              {incident().routeId != null ? `#${incident().routeId}` : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Cadena incidente → pendiente → plan del día"
          subtitle="Sin salir del historial unificado"
        />
        <Show
          when={props.trace.pendingVisits.length > 0}
          fallback={<p class="text-sm text-text-muted">No hay visitas pendientes vinculadas a esta incidencia.</p>}
        >
          <ol class="space-y-4">
            <For each={props.trace.pendingVisits}>
              {(link) => {
                const pending = () => link.pendingVisit as Record<string, unknown>;
                const nextPlan = () => link.nextDailyPlan as Record<string, unknown> | null;
                const targetDate = () => link.targetOperationDate;
                return (
                  <li class="rounded-lg border border-border p-4 dark:border-dark-border">
                    <div class="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      <span class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Incidencia #{incident().id}
                      </span>
                      <ArrowRight size={14} />
                      <span class="rounded-full bg-fero-blue/10 px-2 py-0.5 text-fero-blue">
                        Pendiente {String(pending().code ?? pending().id ?? '—')}
                      </span>
                      <ArrowRight size={14} />
                      <span class="rounded-full bg-fero-green/15 px-2 py-0.5 text-fero-green-dark">
                        Plan {targetDate()}
                      </span>
                    </div>
                    <div class="mt-3 grid gap-3 md:grid-cols-2">
                      <div class="rounded-md bg-surface/60 px-3 py-2 dark:bg-dark-surface/40">
                        <p class="text-xs font-semibold text-text-muted">Visita pendiente</p>
                        <p class="text-sm font-medium text-text-primary dark:text-white">
                          {String(pending().code ?? pending().collectionPointId ?? '—')}
                        </p>
                        <p class="mt-1 text-xs text-text-secondary">
                          Origen {String(pending().originOperationDate ?? '—')} ·{' '}
                          {String(pending().reason ?? '—')}
                        </p>
                        <PlanningStatusBadge status={String(pending().status ?? 'open')} class="mt-2" />
                      </div>
                      <div class="rounded-md bg-surface/60 px-3 py-2 dark:bg-dark-surface/40">
                        <p class="text-xs font-semibold text-text-muted">Próximo plan del día</p>
                        <Show
                          when={nextPlan()}
                          fallback={
                            <p class="mt-1 text-sm text-text-muted">
                              Aún no existe plan para {targetDate()}.
                            </p>
                          }
                        >
                          {(plan) => (
                            <div>
                              <p class="text-sm font-medium text-text-primary dark:text-white">
                                {String(plan().operationDate ?? targetDate())}
                              </p>
                              <PlanningStatusBadge
                                status={String(plan().status ?? 'draft')}
                                class="mt-2"
                              />
                              <A
                                href={optimizationDateHref(targetDate())}
                                class="mt-2 inline-block text-xs font-medium text-fero-blue hover:underline"
                              >
                                Ir al plan del día
                              </A>
                            </div>
                          )}
                        </Show>
                      </div>
                    </div>
                  </li>
                );
              }}
            </For>
          </ol>
        </Show>
      </Card>
    </div>
  );
}
