import { AlertTriangle, RefreshCw, Send } from 'lucide-solid';
import { For, Show, createSignal } from 'solid-js';
import { Button, SelectField, TextField } from '../../design-system/components';
import { criticalityLabel } from '../route-playback/daySimulationUx';
import type { ContingencySimulationType } from '../../core/api/contingencies';
import {
  applyContingencySimulation,
  clearContingencySimulation,
  optimizationState,
  simulateContingency,
} from '../../core/stores/optimizationStore';

function formatKm(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)} km`;
}

/**
 * Simulador de contingencias del día (Fase 3): calcula el plan alternativo en
 * dry-run y permite aplicarlo con los endpoints reales. El contexto/día activo
 * sale del store de optimización.
 */
export function OptimizationContingencySimulator(props: { onApplied?: () => void }) {
  const [type, setType] = createSignal<ContingencySimulationType>('breakdown');
  const [vehicleId, setVehicleId] = createSignal('');
  const [pointCode, setPointCode] = createSignal('');

  const vehicles = () => optimizationState.context?.assignableVehicles ?? [];
  const simulation = () => optimizationState.contingencySimulation;
  const busy = () => optimizationState.isSimulatingContingency || optimizationState.isApplyingContingency;

  const run = () => {
    void simulateContingency({
      type: type(),
      vehicleId: vehicleId() || undefined,
      pointCode: pointCode() || undefined,
    }).catch(() => {
      // El store ya expone el error en `contingencyError`.
    });
  };

  const apply = () => {
    void applyContingencySimulation()
      .then(() => props.onApplied?.())
      .catch(() => {
        // El store ya expone el error en `contingencyError`.
      });
  };

  return (
    <div class="space-y-4" data-testid="optimization-contingency-simulator">
      <p class="text-sm text-text-secondary">
        Calcula un plan alternativo <strong>sin despachar</strong>. Revísalo y, si te convence,
        aplícalo para recalcular las rutas reales.
      </p>

      <div class="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={type() === 'breakdown' ? 'primary' : 'outline'}
          data-testid="contingency-type-breakdown"
          onClick={() => setType('breakdown')}
        >
          Avería de camión
        </Button>
        <Button
          size="sm"
          variant={type() === 'critical_container' ? 'primary' : 'outline'}
          data-testid="contingency-type-critical"
          onClick={() => setType('critical_container')}
        >
          Contenedor crítico
        </Button>
      </div>

      <Show
        when={type() === 'breakdown'}
        fallback={
          <TextField
            label="Código del contenedor (opcional)"
            placeholder="Se elige el más lleno del día"
            value={pointCode()}
            onInput={(event) => setPointCode(event.currentTarget.value)}
            data-testid="contingency-point-code"
          />
        }
      >
        <SelectField
          label="Vehículo (opcional)"
          value={vehicleId()}
          onChange={(event) => setVehicleId(event.currentTarget.value)}
          data-testid="contingency-vehicle"
        >
          <option value="">Primer camión del día</option>
          <For each={vehicles()}>{(vehicle) => <option value={vehicle.id}>{vehicle.id}</option>}</For>
        </SelectField>
      </Show>

      <div class="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          class="gap-2"
          icon={
            optimizationState.isSimulatingContingency ? (
              <RefreshCw size={14} class="animate-spin" />
            ) : (
              <AlertTriangle size={14} />
            )
          }
          loading={optimizationState.isSimulatingContingency}
          disabled={busy()}
          data-testid="contingency-simulate"
          onClick={run}
        >
          Simular contingencia
        </Button>
        <Show when={simulation()}>
          <Button
            variant="primary"
            class="gap-2"
            icon={<Send size={14} />}
            loading={optimizationState.isApplyingContingency}
            disabled={busy()}
            data-testid="contingency-apply"
            onClick={apply}
          >
            Aplicar contingencia real
          </Button>
          <Button
            variant="outline"
            disabled={busy()}
            data-testid="contingency-discard"
            onClick={() => clearContingencySimulation()}
          >
            Descartar
          </Button>
        </Show>
      </div>

      <Show when={optimizationState.contingencyError}>
        <p class="text-sm text-red-600 dark:text-red-300" role="alert" data-testid="contingency-error">
          {optimizationState.contingencyError}
        </p>
      </Show>

      <Show when={simulation()}>
        {(sim) => (
          <div
            class="space-y-2 rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/25"
            data-testid="contingency-result"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Simulación — no aplicada
            </p>
            <div class="grid gap-2 sm:grid-cols-3">
              <div>
                <p class="text-xs text-text-muted">Antes</p>
                <p class="text-lg font-bold text-text-primary dark:text-white">
                  {formatKm(sim().beforeDistanceKm)}
                </p>
              </div>
              <div>
                <p class="text-xs text-text-muted">Después (simulado)</p>
                <p class="text-lg font-bold text-text-primary dark:text-white">
                  {formatKm(sim().afterDistanceKm)}
                </p>
              </div>
              <div>
                <p class="text-xs text-text-muted">Reasignados</p>
                <p class="text-lg font-bold text-text-primary dark:text-white">
                  {sim().reassignedPoints} pts
                </p>
              </div>
            </div>
            <p class="text-sm text-amber-900 dark:text-amber-100">{sim().message}</p>
            <Show when={sim().droppedDetails.length > 0}>
              <div class="space-y-1" data-testid="contingency-dropped">
                <p class="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  Sin atender ({sim().droppedDetails.length})
                </p>
                <ul class="space-y-1">
                  <For each={sim().droppedDetails}>
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
              </div>
            </Show>
            <Show when={sim().droppedDetails.length === 0 && sim().resolution === 'reassigned'}>
              <p class="text-xs text-fero-green-dark">
                Sin puntos sacrificados: plan reasignado completo.
              </p>
            </Show>
            <Show when={sim().vehicleId}>
              <p class="text-xs text-text-muted">Vehículo: {sim().vehicleId}</p>
            </Show>
            <Show when={sim().pointCode}>
              <p class="text-xs text-text-muted">Contenedor: {sim().pointCode}</p>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
