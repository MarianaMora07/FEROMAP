import { For, Show } from 'solid-js';
import { Card, CardHeader } from '../../design-system/components';
import type { Scenario } from '../../data/types/simulation';
import { DEFAULT_SHIFT_REFERENCE_HOURS, type ConditionId } from './simulationConfig';
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
  fleetAssignableCount?: number;
  criticalPointCount?: number;
  rainIntensity?: string;
  wasteLevel?: string;
  durationHours?: string;
  crewShortageEnabled?: boolean;
  operatorsShortage?: string;
  acoPreset?: string;
  acoAnts?: string;
  acoIterations?: string;
}

export function ConfigurationSummaryPanel(props: ConfigurationSummaryPanelProps) {
  const derived = () => describeDerivedScenario(props.conditions, props.scenarios);
  const mappings = () => getActiveConditionMappings(props.conditions);
  const parameterNotes = () =>
    buildParameterEffectNotes({
      rainIntensity: props.rainIntensity ?? 'alta',
      wasteLevel: props.wasteLevel ?? '30',
      durationHours: props.durationHours ?? DEFAULT_SHIFT_REFERENCE_HOURS,
      conditions: props.conditions,
      scenarioId: derived().scenarioId,
      crewShortageEnabled: props.crewShortageEnabled ?? false,
      operatorsShortage: props.operatorsShortage ?? '2',
      acoPreset: props.acoPreset ?? 'standard',
      acoAnts: props.acoAnts ?? '12',
      acoIterations: props.acoIterations ?? '20',
    });

  return (
    <Card class="self-start" data-testid="simulation-config-summary">
      <CardHeader title="Resumen en vivo" subtitle="Se actualiza al cambiar condiciones" />
      <div class="space-y-4">
        <div class="rounded-lg border border-default bg-surface/80 px-3 py-2.5">
          <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Escenario derivado</p>
          <p class="mt-1 text-sm font-semibold text-text-primary dark:text-white">{derived().label}</p>
          <p class="mt-1 text-xs text-text-secondary">{derived().description}</p>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Condiciones activas</p>
          <Show
            when={mappings().length > 0}
            fallback={<p class="text-sm text-text-muted">Ninguna condición adicional.</p>}
          >
            <ul class="space-y-1.5">
              <For each={mappings()}>
                {(item) => (
                  <li class="text-xs text-text-secondary">
                    <span class="font-medium text-text-primary dark:text-white">{item.label}</span>
                    <span class="text-text-muted"> — {item.effect}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Motor y parámetros</p>
          <ul class="space-y-1 text-xs text-text-secondary">
            <For each={parameterNotes()}>
              {(note) => (
                <li>
                  <span class="font-medium text-text-primary dark:text-white">{note.label}</span>
                  <Show when={note.status === 'informative'}>
                    <span class="text-text-muted"> (informativo)</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Recursos del sistema</p>
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
            <Show when={(props.fleetAssignableCount ?? 0) > 0}>
              <p class="mt-2 text-xs text-text-muted">
                La simulación usará camiones disponibles o en ruta (excluye mantenimiento).
              </p>
            </Show>
            <Show when={(props.criticalPointCount ?? 0) > 0}>
              <p class="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {props.criticalPointCount} punto{props.criticalPointCount === 1 ? '' : 's'} crítico
                {props.criticalPointCount === 1 ? '' : 's'} priorizado{props.criticalPointCount === 1 ? '' : 's'} en
                la ruta.
              </p>
            </Show>
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
