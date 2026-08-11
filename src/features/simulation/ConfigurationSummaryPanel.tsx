import { For, Show } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import type { Scenario } from '../../data/types/simulation';
import type { ConditionId } from './simulationConfig';
import {
  buildParameterEffectNotes,
  describeDerivedScenario,
  getActiveConditionMappings,
} from '../../core/utils/simulationWizard';
import type { SimulationReadiness } from '../../core/utils/simulationWizard';

interface ConfigurationSummaryPanelProps {
  conditions: Record<ConditionId, boolean>;
  scenarios: Scenario[];
  readiness: SimulationReadiness | undefined;
  loadingReadiness?: boolean;
  rainIntensity?: string;
  wasteLevel?: string;
  durationHours?: string;
  crewShortageEnabled?: boolean;
  operatorsShortage?: string;
}

export function ConfigurationSummaryPanel(props: ConfigurationSummaryPanelProps) {
  const derived = () => describeDerivedScenario(props.conditions, props.scenarios);
  const mappings = () => getActiveConditionMappings(props.conditions);
  const parameterNotes = () =>
    buildParameterEffectNotes({
      rainIntensity: props.rainIntensity ?? 'alta',
      wasteLevel: props.wasteLevel ?? '30',
      durationHours: props.durationHours ?? '4',
      conditions: props.conditions,
      scenarioId: derived().scenarioId,
      crewShortageEnabled: props.crewShortageEnabled ?? false,
      operatorsShortage: props.operatorsShortage ?? '2',
    });

  return (
    <Card class="self-start">
      <CardHeader title="Qué estás configurando" />
      <div class="space-y-4">
        <div class="rounded-lg border border-fero-green/30 bg-fero-green/10 px-3 py-2.5">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-fero-green-dark">
            Escenario que se ejecutará
          </p>
          <p class="mt-1 text-sm font-semibold text-text-primary dark:text-white">{derived().label}</p>
          <p class="mt-1 text-xs text-text-secondary">{derived().description}</p>
          <p class="mt-2 text-[11px] text-text-muted">{derived().source}</p>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Condiciones activas
          </p>
          <Show
            when={mappings().length > 0}
            fallback={<p class="text-sm text-text-muted">Ninguna condición adicional seleccionada.</p>}
          >
            <ul class="space-y-2">
              <For each={mappings()}>
                {(item) => (
                  <li class="rounded-md border border-border px-2.5 py-2 text-xs dark:border-dark-border">
                    <span class="font-semibold text-text-primary dark:text-white">{item.label}</span>
                    <span class="mt-0.5 block text-text-muted">{item.effect}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Parámetros adicionales
          </p>
          <ul class="space-y-2">
            <For each={parameterNotes()}>
              {(note) => (
                <li class="rounded-md border border-border px-2.5 py-2 text-xs dark:border-dark-border">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold text-text-primary dark:text-white">{note.label}</span>
                    <span
                      class={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        note.status === 'connected'
                          ? 'bg-fero-green/15 text-fero-green-dark'
                          : 'bg-slate-100 text-text-muted dark:bg-dark-surface-hover'
                      }`}
                    >
                      {note.status === 'connected' ? 'Conectado' : 'Informativo'}
                    </span>
                  </div>
                  <span class="mt-0.5 block text-text-muted">{note.detail}</span>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Recursos del sistema
          </p>
          <Show
            when={!props.loadingReadiness}
            fallback={<p class="text-sm text-text-muted">Verificando flota y puntos…</p>}
          >
            <ul class="space-y-1 text-sm text-text-secondary">
              <li>
                Vehículos asignables:{' '}
                <span class="font-semibold text-text-primary dark:text-white">
                  {props.readiness?.assignableVehicles ?? '—'}
                </span>
              </li>
              <li>
                Puntos activos:{' '}
                <span class="font-semibold text-text-primary dark:text-white">
                  {props.readiness?.activePoints ?? '—'}
                </span>
              </li>
            </ul>
            <Show when={props.readiness && !props.readiness.ready}>
              <ul class="mt-2 space-y-1">
                <For each={props.readiness!.issues}>
                  {(issue) => (
                    <li class="rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-300">
                      {issue}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </div>
    </Card>
  );
}
