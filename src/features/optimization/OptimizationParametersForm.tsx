import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronDown, Loader2, Sparkles } from 'lucide-solid';
import { Button, Card, CardHeader, SelectField } from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import {
  optimizationState,
  setOptimizationScenario,
  updateOptimizationPreset,
} from '../../core/stores/optimizationStore';
import { constraints as constraintDefs, objectives as objectiveOptions } from '../../data/mock/optimization';
import type { KpiView, OptimizationConstraints } from '../../core/api/optimization';
import type { ScenarioId } from '../../data/types/simulation';
import { shouldFleetAccordionStartOpen } from './optimizationLayoutUx';

const vehicleToneClass = {
  blue: 'bg-fero-blue/10 text-fero-blue border-fero-blue/20',
  green: 'bg-fero-green/15 text-fero-green-dark border-fero-green/30',
  purple: 'bg-violet-100 text-violet-700 border-violet-200',
};

function AccordionSection(props: {
  title: string;
  open?: boolean;
  children: import('solid-js').JSX.Element;
}) {
  return (
    <details class="group rounded-lg border border-default bg-elevated/40" open={props.open}>
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-text-primary marker:content-none">
        {props.title}
        <ChevronDown
          size={14}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="space-y-3 border-t border-default px-3 py-3">{props.children}</div>
    </details>
  );
}

interface OptimizationParametersFormProps {
  onGenerate: () => void;
  disabled?: boolean;
  formGenerateVisible: boolean;
  generateAnchorRef: (element: HTMLDivElement | undefined) => void;
}

export function OptimizationParametersForm(props: OptimizationParametersFormProps) {
  const preset = () => optimizationState.preset;
  const context = () => optimizationState.context;
  const assignableVehicles = () => context()?.assignableVehicles ?? [];
  const fleetOpen = () => shouldFleetAccordionStartOpen(assignableVehicles().length);

  const toggleConstraint = (id: keyof OptimizationConstraints) => {
    updateOptimizationPreset({
      constraints: { ...preset().constraints, [id]: !preset().constraints[id] },
    });
  };

  const canSubmit = () =>
    !props.disabled &&
    !optimizationState.isOptimizing &&
    canOptimize(authUser()?.role) &&
    optimizationState.weeklyPlanApproved;

  return (
    <div ref={props.generateAnchorRef}>
      <Card>
      <CardHeader title="Parámetros de optimización" />
      <form
        class="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          props.onGenerate();
        }}
      >
        <AccordionSection title="Condición del día" open>
          <SelectField
            label="Escenario operativo"
            name="scenario"
            value={preset().scenarioId}
            onChange={(e) => setOptimizationScenario(e.currentTarget.value as ScenarioId)}
          >
            <For each={context()?.scenarios ?? []}>
              {(scenario) => <option value={scenario.id}>{scenario.label}</option>}
            </For>
          </SelectField>
          <SelectField
            label="Mostrar resultados por"
            name="kpiView"
            value={preset().kpiView}
            onChange={(e) => updateOptimizationPreset({ kpiView: e.currentTarget.value as KpiView })}
          >
            <For each={objectiveOptions}>
              {(objective) => <option value={objective.id}>{objective.label}</option>}
            </For>
          </SelectField>
          <p class="text-xs text-text-muted">
            El motor ACO sigue minimizando distancia; esta opción solo cambia la narrativa de KPIs.
          </p>
          <p class="text-xs text-text-muted">
            Para comparar condiciones (lluvia, saturación, impacto en KPIs), usa{' '}
            <A href="/simulation" class="font-medium text-fero-blue hover:underline">
              Simulación de escenarios
            </A>
            .
          </p>
          <p class="text-xs text-text-muted">
            Motor ACO — 12 hormigas × 20 iteraciones (único algoritmo soportado).
          </p>
        </AccordionSection>

        <AccordionSection title="Restricciones">
          <ul class="space-y-2.5">
            <For each={constraintDefs}>
              {(item) => {
                const scenarioHints = item.id === 'avoid_traffic' || item.id === 'critical_first';
                const engineConnected = item.id === 'fill_level' || item.id === 'time_window';
                const connected = scenarioHints || engineConnected;
                const hint = () => {
                  if (item.id === 'fill_level') {
                    return 'Prioriza contenedores ≥80% en la heurística ACO.';
                  }
                  if (item.id === 'time_window') {
                    return 'Ventanas amplias por sector (mañana 06–12 h / tarde 12–18 h).';
                  }
                  if (scenarioHints) {
                    return 'Influye en el escenario inferido si no eliges uno explícito.';
                  }
                  return 'Próximamente — no modifica el motor actual.';
                };
                return (
                  <li>
                    <label
                      class={`flex items-start gap-2.5 text-sm ${
                        connected ? 'cursor-pointer text-text-secondary' : 'text-text-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        class="mt-0.5 size-4 rounded border-default accent-fero-green-mid"
                        checked={preset().constraints[item.id as keyof OptimizationConstraints]}
                        disabled={!connected}
                        onChange={() =>
                          connected && toggleConstraint(item.id as keyof OptimizationConstraints)
                        }
                      />
                      <span>
                        {item.label}
                        <span class="mt-0.5 block text-[11px] text-text-muted">{hint()}</span>
                      </span>
                    </label>
                  </li>
                );
              }}
            </For>
          </ul>
        </AccordionSection>

        <AccordionSection title={`Flota (${assignableVehicles().length})`} open={fleetOpen()}>
          <div class="flex flex-wrap gap-2 rounded-md border border-default bg-elevated px-3 py-2.5">
            <Show
              when={assignableVehicles().length > 0}
              fallback={<span class="text-xs text-text-muted">Sin vehículos asignables</span>}
            >
              <For each={assignableVehicles()}>
                {(v, index) => {
                  const tones = ['blue', 'green', 'purple'] as const;
                  const tone = tones[index() % tones.length]!;
                  return (
                    <span
                      class={`inline-flex flex-col rounded-full border px-2.5 py-0.5 text-xs font-semibold ${vehicleToneClass[tone]}`}
                      title={v.driver !== '—' ? v.driver : 'Sin conductor asignado'}
                    >
                      <span>{v.id}</span>
                      <Show when={v.driver && v.driver !== '—'}>
                        <span class="text-[10px] font-medium opacity-80">{v.driver}</span>
                      </Show>
                    </span>
                  );
                }}
              </For>
            </Show>
          </div>
        </AccordionSection>

        <div class="pt-1">
          <Button
            type="submit"
            variant="gradient"
            size="lg"
            class={`w-full font-semibold ${props.formGenerateVisible ? '' : 'hidden'}`}
              icon={
                optimizationState.isOptimizing ? (
                  <Loader2 size={18} class="animate-spin" />
                ) : (
                  <Sparkles size={18} />
                )
              }
              disabled={!canSubmit()}
              title={!optimizationState.weeklyPlanApproved ? 'Falta aprobar plan semanal' : undefined}
              aria-label="Generar ruta operativa"
              data-testid="optimization-generate-route-form"
            >
              {optimizationState.isOptimizing
                ? `Ejecutando optimización… ${optimizationState.optimizationProgress}%`
                : 'Generar ruta operativa'}
            </Button>
        </div>
      </form>
      </Card>
    </div>
  );
}
