import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { CloudRain } from 'lucide-solid';
import { Button } from '../../design-system/components';
import type { ScenarioId } from '../../data/types/simulation';

interface DailyScenarioBannerProps {
  scenarioId: ScenarioId;
  scenarioLabel: string;
  weeklyPlanApproved: boolean;
  pendingCount: number;
  /** Aprueba el plan semanal en sitio; si se define, el CTA es una acción. */
  onApprove?: () => void;
  /** Estado de carga mientras se aprueba el plan semanal. */
  approving?: boolean;
  /** Deep link a la semana del día para revisarla antes de aprobar. */
  weeklyHref?: string;
}

export function DailyScenarioBanner(props: DailyScenarioBannerProps) {
  return (
    <div
      class="rounded-xl border border-violet-300/50 bg-violet-50/70 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20"
      data-testid="daily-scenario-banner"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/50">
            <CloudRain size={18} />
          </span>
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-200">
              Situación del día
            </p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              <span>Escenario heredado del plan semanal:</span>
              <span class="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">
                {props.scenarioLabel}
                <span class="font-mono text-[10px] font-normal opacity-70">({props.scenarioId})</span>
              </span>
            </p>
            <p class="mt-1 text-xs text-text-muted">
              Ajustable en «Condición operativa del día» antes de generar la ruta; no afecta la
              simulación de tesis.
            </p>
          </div>
        </div>
        <Show when={props.pendingCount > 0}>
          <span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {props.pendingCount} pendiente{props.pendingCount === 1 ? '' : 's'}
          </span>
        </Show>
      </div>
      <Show when={!props.weeklyPlanApproved}>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-violet-200/70 pt-3 dark:border-violet-900/30">
          <p class="text-xs font-medium text-amber-700 dark:text-amber-200">
            Aprueba el plan semanal para habilitar optimización y simulación de recorrido.
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <Show when={props.weeklyHref}>
              <A
                href={props.weeklyHref!}
                class="text-xs font-medium text-fero-blue hover:underline"
                data-testid="daily-banner-review-week"
              >
                Revisar semana
              </A>
            </Show>
            <Button
              variant="primary"
              size="sm"
              loading={props.approving}
              disabled={props.approving || !props.onApprove}
              onClick={() => props.onApprove?.()}
              data-testid="daily-banner-approve-week"
            >
              {props.approving ? 'Aprobando…' : 'Aprobar plan semanal'}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
