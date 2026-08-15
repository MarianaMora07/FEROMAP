import { Show } from 'solid-js';
import { CloudRain } from 'lucide-solid';
import type { ScenarioId } from '../../data/types/simulation';

interface DailyScenarioBannerProps {
  scenarioId: ScenarioId;
  scenarioLabel: string;
  weeklyPlanApproved: boolean;
  pendingCount: number;
}

export function DailyScenarioBanner(props: DailyScenarioBannerProps) {
  return (
    <div
      class="rounded-xl border border-violet-300/40 bg-violet-50/70 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20"
      data-testid="daily-scenario-banner"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/50">
            <CloudRain size={18} />
          </span>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-200">
              Situación del día
            </p>
            <p class="mt-0.5 text-sm text-text-secondary">
              Escenario heredado del plan semanal:{' '}
              <span class="font-semibold text-text-primary">{props.scenarioLabel}</span>
              <span class="ml-1 font-mono text-xs text-text-muted">({props.scenarioId})</span>
            </p>
            <p class="mt-1 text-xs text-text-muted">
              Puedes ajustarlo en «Condición operativa del día» antes de generar la ruta. No afecta la
              simulación de tesis en otro módulo.
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
        <p class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-200">
          Aprueba el plan semanal para habilitar optimización y simulación de recorrido.
        </p>
      </Show>
    </div>
  );
}
