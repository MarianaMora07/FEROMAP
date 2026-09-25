import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ChevronDown, Loader2, Sparkles } from 'lucide-solid';
import { Button, Card, CardHeader, SelectField, TextField } from '../../design-system/components';
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
import {
  OBJECTIVE_WEIGHT_STEP,
  OBJECTIVE_WEIGHT_UI_MAX,
  clampMaxRouteHoursTarget,
  clampObjectiveWeight,
  describeServiceLevel,
  formatObjectiveWeight,
  normalizeEstimatedDurationHours,
} from './optimizationObjectiveUx';
import { shouldFleetAccordionStartOpen } from './optimizationLayoutUx';

/** Hora de salida de la flota → banda de congestión (Tarea 4). */
const departureHourOptions = [
  { value: '6', label: '06:00 — Pico mañana (×1.30)' },
  { value: '7', label: '07:00 — Pico mañana (×1.30)' },
  { value: '8', label: '08:00 — Pico mañana (×1.30)' },
  { value: '9', label: '09:00 — Valle (×1.00)' },
  { value: '10', label: '10:00 — Valle (×1.00)' },
  { value: '11', label: '11:00 — Valle (×1.00)' },
  { value: '12', label: '12:00 — Valle (×1.00)' },
  { value: '13', label: '13:00 — Valle (×1.00)' },
  { value: '14', label: '14:00 — Valle (×1.00)' },
  { value: '15', label: '15:00 — Valle (×1.00)' },
  { value: '16', label: '16:00 — Valle (×1.00)' },
  { value: '17', label: '17:00 — Pico tarde (×1.25)' },
  { value: '18', label: '18:00 — Pico tarde (×1.25)' },
];

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
  const serviceLevel = () =>
    describeServiceLevel(preset().workloadBalanceWeight, preset().makespanWeight);

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

  const hasResults = () => optimizationState.kpis != null;
  // Sin resultados: "Generar". Con el día ya optimizado no se regenera desde aquí.
  const showGenerate = () => !hasResults() || optimizationState.isOptimizing;
  const generateLabel = () => 'Generar rutas del día';

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
            label="Hora de salida de la flota"
            name="departureHour"
            value={String(preset().departureHour)}
            onChange={(e) =>
              updateOptimizationPreset({ departureHour: Number(e.currentTarget.value) })
            }
          >
            <For each={departureHourOptions}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </SelectField>
          <p class="text-xs text-text-muted">
            La hora define la franja de congestión (pico mañana 06–09 ×1.30, valle ×1.0,
            pico tarde 17–19 ×1.25). Con tráfico activo el motor re-enruta por tiempo ponderado.
          </p>
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
            El motor ACO puede priorizar servicio además de distancia (panel «Objetivo de
            servicio»). Esta opción solo cambia la narrativa de KPIs.
          </p>
          <p class="text-xs text-text-muted">
            Para comparar condiciones (lluvia, saturación, impacto en KPIs), usa{' '}
            <A href="/simulation" class="font-medium text-fero-blue hover:underline">
              Simulación ACO (tesis)
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

        <AccordionSection title="Objetivo de servicio">
          <div class="space-y-1">
            <label class="flex items-center justify-between text-sm text-text-secondary">
              <span>Equidad de carga entre camiones</span>
              <b class="font-mono text-text-primary">
                {formatObjectiveWeight(preset().workloadBalanceWeight)}
              </b>
            </label>
            <input
              type="range"
              min="0"
              max={OBJECTIVE_WEIGHT_UI_MAX}
              step={OBJECTIVE_WEIGHT_STEP}
              value={preset().workloadBalanceWeight}
              class="w-full accent-fero-green-mid"
              aria-label="Peso de equidad de carga"
              onInput={(e) =>
                updateOptimizationPreset({
                  workloadBalanceWeight: clampObjectiveWeight(Number(e.currentTarget.value)),
                })
              }
            />
            <p class="text-[11px] text-text-muted">
              Reparte las horas de servicio: evita que un camión trabaje el 100 % de la jornada
              mientras otro queda ocioso.
            </p>
          </div>

          <div class="space-y-1">
            <label class="flex items-center justify-between text-sm text-text-secondary">
              <span>Duración máxima de ruta (makespan)</span>
              <b class="font-mono text-text-primary">
                {formatObjectiveWeight(preset().makespanWeight)}
              </b>
            </label>
            <input
              type="range"
              min="0"
              max={OBJECTIVE_WEIGHT_UI_MAX}
              step={OBJECTIVE_WEIGHT_STEP}
              value={preset().makespanWeight}
              class="w-full accent-fero-green-mid"
              aria-label="Peso de makespan"
              onInput={(e) =>
                updateOptimizationPreset({
                  makespanWeight: clampObjectiveWeight(Number(e.currentTarget.value)),
                })
              }
            />
            <p class="text-[11px] text-text-muted">
              Acorta la ruta más larga de la flota, para que ninguna jornada quede al límite.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-1">
              <SelectField
                label="Jornada de turno (h)"
                name="estimatedDurationHours"
                value={
                  preset().estimatedDurationHours == null
                    ? ''
                    : String(preset().estimatedDurationHours)
                }
                onChange={(e) => {
                  const raw = e.currentTarget.value;
                  updateOptimizationPreset({
                    estimatedDurationHours: normalizeEstimatedDurationHours(
                      raw === '' ? null : Number(raw),
                    ),
                  });
                }}
              >
                <option value="">Instalación (06:00–18:00)</option>
                <For each={[4, 6, 8, 10, 12]}>{(hours) => <option value={String(hours)}>{hours} h</option>}</For>
              </SelectField>
              <p class="text-[11px] text-text-muted">
                Recorta el turno real del motor: una jornada más corta reparte la carga entre más
                camiones y acorta las rutas.
              </p>
            </div>
            <div class="space-y-1">
              <TextField
                label="Vehículos activos (mínimo)"
                type="number"
                min="1"
                step="1"
                placeholder="Sin restricción"
                value={
                  preset().minActiveVehicles == null ? '' : String(preset().minActiveVehicles)
                }
                onInput={(e) => {
                  const raw = e.currentTarget.value.trim();
                  updateOptimizationPreset({
                    minActiveVehicles: raw === '' ? null : Math.max(1, Number(raw)),
                  });
                }}
              />
              <p class="text-[11px] text-text-muted">
                Garantiza un mínimo de camiones con trabajo. Si es mayor que los puntos del día,
                el motor lo degrada y avisa.
              </p>
            </div>
            <div class="space-y-1">
              <TextField
                label="Jornada objetivo (h)"
                type="number"
                min="1"
                max="18"
                step="0.5"
                value={String(preset().maxRouteHoursTarget)}
                onInput={(e) =>
                  updateOptimizationPreset({
                    maxRouteHoursTarget: clampMaxRouteHoursTarget(Number(e.currentTarget.value)),
                  })
                }
              />
              <p class="text-[11px] text-text-muted">
                Solo mide el cumplimiento (KPI «≤ objetivo»); no recorta el turno.
              </p>
            </div>
          </div>

          <p class="rounded-md border border-default bg-elevated/60 px-3 py-2 text-xs text-text-secondary">
            <b>{serviceLevel().label}</b> — {serviceLevel().hint}
          </p>
          <p class="text-[11px] text-text-muted">
            Rango recomendado 0–3: por encima la distancia crece más del 15 % (criterio de
            aceptación). El motor admite hasta 10 vía API. Los valores por defecto y la{' '}
            <b>rotación de flota semanal</b> se configuran en{' '}
            <A href="/settings" class="font-medium text-fero-blue hover:underline">
              Configuración → Algoritmo
            </A>
            .
          </p>
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

        <Show when={showGenerate()}>
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
                aria-label={generateLabel()}
                data-testid="optimization-generate-route-form"
              >
                {optimizationState.isOptimizing
                  ? `Ejecutando optimización… ${optimizationState.optimizationProgress}%`
                  : generateLabel()}
              </Button>
          </div>
        </Show>
      </form>
      </Card>
    </div>
  );
}
