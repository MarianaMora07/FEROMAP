import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, ChevronDown } from 'lucide-solid';
import type { DailyPlan, PendingVisit } from '../../core/api/planning';
import { Button } from '../../design-system/components';
import { PlanningStatusBadge } from '../planning/PlanningStatusBadge';

interface OptimizationDeskIntroProps {
  selectedDate: string;
  dailyPlan?: DailyPlan | null;
  weeklyPlanApproved: boolean;
  scenarioLabel?: string;
  pendingCount: number;
  scheduledCount: number;
  totalCount: number;
  pendingPoints: PendingVisit[];
  loading?: boolean;
  pdfDisabled?: boolean;
  onRefreshPending: () => void;
  onCloseDay: () => void;
  onDownloadPdf: () => void;
}

export function OptimizationDeskIntro(props: OptimizationDeskIntroProps) {
  return (
    <div
      class="flex flex-col gap-3 rounded-lg border border-default bg-surface/60 px-3 py-2.5"
      data-testid="optimization-desk-intro"
    >
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 space-y-1">
          <p class="text-sm font-semibold text-text-primary dark:text-white">Plan del día</p>
          <p class="text-sm text-text-secondary">
            Planificación operativa — genera rutas, simula el recorrido y despacha a campo.
          </p>
          <Show when={!props.loading} fallback={<p class="text-xs text-text-muted">Cargando plan…</p>}>
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
              <span class="font-medium text-text-primary dark:text-white">
                {props.dailyPlan?.operationDate ?? props.selectedDate}
              </span>
              <PlanningStatusBadge status={props.dailyPlan?.status ?? 'draft'} />
              <Show when={props.scenarioLabel}>
                <span class="text-text-muted">Escenario: {props.scenarioLabel}</span>
              </Show>
              <span class="text-text-muted">
                {props.scheduledCount} programados · {props.pendingCount} pendientes · {props.totalCount}{' '}
                total
              </span>
            </p>
          </Show>
          <Show when={!props.weeklyPlanApproved}>
            <p class="text-xs font-medium text-amber-700 dark:text-amber-200">
              Aprueba el plan semanal para habilitar optimización y simulación de recorrido.
            </p>
          </Show>
        </div>
        <A
          href="/simulation"
          class="inline-flex shrink-0 items-center gap-1 rounded-full border border-default bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-violet-300/60 hover:text-text-primary dark:hover:border-violet-800/40"
        >
          Evaluar escenarios (tesis)
          <ArrowRight size={12} aria-hidden="true" />
        </A>
      </div>

      <Show when={!props.loading}>
        <div class="flex flex-wrap items-center gap-2 border-t border-default pt-3">
          <Button variant="outline" size="sm" onClick={() => props.onRefreshPending()}>
            Actualizar pendientes
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onCloseDay()}>
            Cerrar día
          </Button>
          <details class="relative">
            <summary class="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-default bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary marker:content-none hover:bg-app">
              Más
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div class="absolute left-0 z-10 mt-1 min-w-44 rounded-md border border-default bg-elevated py-1 shadow-md">
              <button
                type="button"
                class="block w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-app disabled:opacity-50"
                disabled={props.pdfDisabled}
                onClick={() => props.onDownloadPdf()}
              >
                Exportar PDF del día
              </button>
            </div>
          </details>
        </div>

        <Show when={props.pendingCount > 0}>
          <details class="rounded-lg border border-amber-300/40 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20">
            <summary class="cursor-pointer list-none px-3 py-2 text-xs font-medium text-amber-900 marker:content-none dark:text-amber-200">
              Ver {props.pendingCount} pendiente{props.pendingCount === 1 ? '' : 's'} incorporados al plan
            </summary>
            <ul class="space-y-1 border-t border-amber-200/60 px-3 py-2 text-sm text-text-secondary dark:border-amber-900/40">
              <For each={props.pendingPoints}>
                {(visit) => (
                  <li>
                    {visit.code} — origen {visit.originOperationDate} ({visit.reason})
                  </li>
                )}
              </For>
            </ul>
          </details>
        </Show>
      </Show>
    </div>
  );
}
