import { For, Show } from 'solid-js';
import { AlertTriangle, ArrowRight, Check, Pause, Play, RotateCcw, X } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import type { DaySimulation, DaySimulationResolution } from '../../core/api/daySimulation';
import type { DaySimulationController } from '../route-playback/useDaySimulation';
import {
  criticalityLabel,
  droppedSummary,
  elapsedOperationMinutes,
  simulatedDayClockLabel,
  stepImpactLabel,
  stepStabilityPct,
  type DayVehicleOption,
} from '../route-playback/daySimulationUx';

interface DaySimulationPanelProps {
  controller: DaySimulationController;
  simulation?: DaySimulation | null;
  operationDate: string;
  loading?: boolean;
  error?: string | null;
  /** Camiones del selector (día + contingencias), con su origen. */
  vehicles?: DayVehicleOption[];
  isVehicleHidden?: (label: string) => boolean;
  onToggleVehicle?: (label: string) => void;
  onShowAllVehicles?: () => void;
  onHideAllVehicles?: () => void;
  onClose: () => void;
}

const RESOLUTION_META: Record<
  DaySimulationResolution,
  { label: string; variant: 'success' | 'warning' | 'info' }
> = {
  reassigned: { label: 'Reasignado a la flota', variant: 'success' },
  pending: { label: 'Queda sin atender', variant: 'warning' },
  no_change: { label: 'Sin cambios', variant: 'info' },
};

function targetLabel(target: { vehicleId?: string; pointCode?: string }): string {
  if (target.vehicleId) return `Vehículo ${target.vehicleId}`;
  if (target.pointCode) return `Contenedor ${target.pointCode}`;
  return 'Objetivo';
}

/**
 * Overlay de la simulación guionada del día: reproduce el recorrido comprimido y
 * pausa en cada contingencia mostrando cómo la resolvió el motor.
 */
export function DaySimulationPanel(props: DaySimulationPanelProps) {
  const routes = () => {
    const all = props.controller.routes();
    const isHidden = props.isVehicleHidden;
    if (!isHidden) return all;
    return all.filter((route) => !isHidden(route.vehicleLabel));
  };
  const step = () => props.controller.activeStep();
  const progressPercent = () => Math.round(props.controller.progress() * 100);

  // Dos bloques cuando hay camiones de contingencia: los del día y los que entran con
  // un paso guionado (atenuados hasta que su tramo los active). El índice del
  // `data-testid` se conserva global para no cambiar los localizadores existentes.
  const vehicleGroups = () => {
    const indexed = (props.vehicles ?? []).map((option, index) => ({ option, index }));
    const day = indexed.filter((item) => item.option.source === 'day');
    const contingency = indexed.filter((item) => item.option.source === 'contingency');
    return [
      {
        key: 'day',
        title: `Del día (${day.length})`,
        showTitle: contingency.length > 0,
        items: day,
      },
      {
        key: 'contingency',
        title: `Contingencia (${contingency.length})`,
        showTitle: true,
        items: contingency,
      },
    ].filter((group) => group.items.length > 0);
  };
  const clockLabel = () =>
    simulatedDayClockLabel(routes(), props.controller.progress(), props.controller.operationMinutes());
  const elapsed = () =>
    elapsedOperationMinutes(props.controller.progress(), props.controller.operationMinutes());
  // El resumen del plan (estabilidad y descarte) es global: el selector de camiones
  // filtra la vista del mapa, no las métricas del día.
  const steps = () => props.simulation?.steps ?? [];
  const droppedAll = () =>
    droppedSummary(steps().flatMap((item) => item.droppedDetails ?? []));
  const globalStability = () => {
    const values = steps()
      .map((item) => stepStabilityPct(item))
      .filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  };

  return (
    <div
      class="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-default bg-elevated shadow-xl sm:max-w-md"
      data-testid="day-simulation-panel"
      role="dialog"
      aria-label="Simulación del día"
    >
      <div class="flex items-start justify-between gap-3 border-b border-default px-4 py-3">
        <div>
          <h3 class="font-heading text-base font-semibold text-text-primary">Simulación del día</h3>
          <p class="text-xs text-text-muted">{props.operationDate}</p>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-default text-text-secondary hover:bg-app"
          aria-label="Cerrar simulación del día"
          onClick={() => props.onClose()}
        >
          <X size={16} />
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        <Show when={props.loading}>
          <p class="text-sm text-text-muted">Preparando la simulación del día…</p>
        </Show>

        <Show when={props.error}>
          <p class="text-sm text-red-600" role="alert">
            {props.error}
          </p>
        </Show>

        <Show when={!props.loading && !props.error}>
          <Show when={step()}>
            {(active) => (
              <div
                class="space-y-2 rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25"
                data-testid="day-simulation-step"
                role="status"
              >
                <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  <AlertTriangle size={14} />
                  Contingencia — {targetLabel(active().target)}
                </div>
                <p class="text-sm text-amber-900 dark:text-amber-100">{active().message}</p>
                <div class="flex flex-wrap items-center gap-2">
                  <Badge variant={RESOLUTION_META[active().resolution].variant}>
                    {RESOLUTION_META[active().resolution].label}
                  </Badge>
                  <span class="text-xs text-text-muted">{stepImpactLabel(active())}</span>
                </div>
                <Show when={(active().droppedDetails ?? []).length > 0}>
                  <ul class="space-y-1" data-testid="day-simulation-dropped">
                    <For each={active().droppedDetails ?? []}>
                      {(detail) => (
                        <li class="flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-100">
                          <span class="font-medium">{detail.code}</span>
                          <span class="text-text-muted">
                            {detail.fillPct}% · {criticalityLabel(detail.criticality)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  class="gap-2"
                  data-testid="day-simulation-continue"
                  icon={<ArrowRight size={14} />}
                  onClick={() => props.controller.continueStep()}
                >
                  Continuar
                </Button>
              </div>
            )}
          </Show>

          <Card>
            <CardHeader title="Progreso de la jornada" />
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="font-mono tabular-nums text-fero-blue">{clockLabel() ?? '—'}</span>
                <span class="text-text-muted">{progressPercent()}%</span>
              </div>
              <input
                type="range"
                class="route-playback-scrubber"
                min={0}
                max={100}
                step={0.5}
                value={progressPercent()}
                aria-label="Posición de la jornada"
                data-testid="day-simulation-scrubber"
                onInput={(event) =>
                  props.controller.setProgress(Number(event.currentTarget.value) / 100)
                }
              />
              <p class="text-xs text-text-muted">{elapsed()} min de jornada simulados</p>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={step() ? 'outline' : 'primary'}
                disabled={Boolean(step())}
                icon={props.controller.isPlaying() ? <Pause size={16} /> : <Play size={16} />}
                data-testid="day-simulation-toggle"
                onClick={() => props.controller.toggle()}
              >
                {props.controller.isPlaying() ? 'Pausa' : 'Reproducir'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<RotateCcw size={16} />}
                data-testid="day-simulation-reset"
                onClick={() => props.controller.reset()}
              >
                Reiniciar
              </Button>
              <Show when={props.controller.isComplete()}>
                <span class="inline-flex items-center gap-1 text-xs font-semibold text-fero-green-dark">
                  <Check size={13} /> Jornada completada
                </span>
              </Show>
            </div>
          </Card>

          <Show when={steps().length > 0}>
            <Card>
              <CardHeader title="Estabilidad del plan" />
              <div class="space-y-3" data-testid="day-simulation-stability">
                <p class="text-sm">
                  <span class="text-text-muted">Estabilidad media: </span>
                  <span class="font-semibold text-text-primary">
                    {globalStability() != null ? `${globalStability()}%` : '—'}
                  </span>
                </p>
                <ul class="space-y-1.5">
                  <For each={steps()}>
                    {(item) => (
                      <li class="flex items-start justify-between gap-3 text-xs">
                        <span class="font-medium text-text-primary">{targetLabel(item.target)}</span>
                        <span class="text-right text-text-muted">{stepImpactLabel(item)}</span>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={droppedAll().total > 0}>
                  <p class="text-xs text-amber-700 dark:text-amber-300" data-testid="day-simulation-dropped-summary">
                    Sin atender: {droppedAll().byCriticality
                      .map((bucket) => `${bucket.count} ${bucket.label.toLowerCase()}`)
                      .join(' · ')}
                  </p>
                </Show>
              </div>
            </Card>
          </Show>

          <Show when={(props.vehicles ?? []).length > 1}>
            <Card>
              <CardHeader title="Vehículos visibles" />
              <div class="space-y-2" data-testid="day-simulation-vehicles">
                <div class="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    class="font-medium text-fero-blue hover:underline"
                    data-testid="day-simulation-vehicles-all"
                    onClick={() => props.onShowAllVehicles?.()}
                  >
                    Todos
                  </button>
                  <span class="text-text-muted">·</span>
                  <button
                    type="button"
                    class="font-medium text-fero-blue hover:underline"
                    data-testid="day-simulation-vehicles-none"
                    onClick={() => props.onHideAllVehicles?.()}
                  >
                    Ninguno
                  </button>
                </div>
                <For each={vehicleGroups()}>
                  {(group) => (
                    <div class="space-y-1.5">
                      <Show when={group.showTitle}>
                        <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          {group.title}
                        </p>
                      </Show>
                      <ul class="space-y-1.5">
                        <For each={group.items}>
                          {(item) => {
                            const hidden = () => props.isVehicleHidden?.(item.option.label) ?? false;
                            const pending = () => item.option.pending;
                            return (
                              <li
                                title={
                                  pending()
                                    ? 'Entra con la contingencia guionada del día'
                                    : undefined
                                }
                              >
                                <button
                                  type="button"
                                  class={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                                    pending()
                                      ? 'cursor-default border-dashed border-default bg-app/30 text-text-muted'
                                      : hidden()
                                        ? 'border-default bg-app/40 text-text-muted'
                                        : 'border-default bg-elevated text-text-primary hover:bg-app'
                                  }`}
                                  data-testid={`day-simulation-vehicle-${item.index}`}
                                  aria-pressed={!hidden()}
                                  disabled={pending()}
                                  onClick={() => props.onToggleVehicle?.(item.option.label)}
                                >
                                  <span
                                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ 'background-color': item.option.color }}
                                    aria-hidden="true"
                                  />
                                  <span class="flex-1 truncate">{item.option.label}</span>
                                  <span
                                    class={`text-[10px] font-semibold uppercase ${
                                      pending() || hidden()
                                        ? 'text-text-muted'
                                        : 'text-fero-green-dark'
                                    }`}
                                  >
                                    {pending() ? 'En espera' : hidden() ? 'Oculto' : 'Visible'}
                                  </span>
                                </button>
                              </li>
                            );
                          }}
                        </For>
                      </ul>
                    </div>
                  )}
                </For>
              </div>
            </Card>
          </Show>

          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Tramo actual
            </p>
            <ul class="space-y-2">
              <For each={routes()}>
                {(route) => (
                  <li
                    class="rounded-lg border border-default px-3 py-2 text-sm"
                    style={{ 'border-left': `3px solid ${route.color}` }}
                    data-testid={`day-simulation-route-${route.routeId}`}
                  >
                    <p class="font-semibold text-text-primary">{route.vehicleLabel}</p>
                    <p class="text-xs text-text-muted">{route.stops.length} paradas</p>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </div>
  );
}
