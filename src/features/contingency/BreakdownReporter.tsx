import { Show, createSignal } from 'solid-js';
import { AlertTriangle, Wrench } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { canReportBreakdown } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { reportBreakdown, simulationState } from '../../core/stores/simulationStore';

interface BreakdownReporterProps {
  vehicles: Array<{ id: string; routeId?: number | null; status?: string }>;
  onComplete?: () => void;
  compact?: boolean;
}

export function BreakdownReporter(props: BreakdownReporterProps) {
  const [selected, setSelected] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  const inRouteVehicles = () =>
    props.vehicles.filter((v) => !v.status || v.status === 'en-ruta');

  const handleReport = async () => {
    const vehicleId = selected() || inRouteVehicles()[0]?.id;
    if (!vehicleId) {
      setError('No hay vehículos en ruta para reportar avería');
      return;
    }
    setError(null);
    try {
      const routeId = inRouteVehicles().find((v) => v.id === vehicleId)?.routeId ?? undefined;
      await reportBreakdown(vehicleId, routeId ?? undefined);
      props.onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reportar avería');
    }
  };

  return (
    <Show when={canReportBreakdown(authUser()?.role)}>
      <div
        class={
          props.compact
            ? 'flex flex-wrap items-center gap-2'
            : 'rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/20'
        }
      >
        <Show when={!props.compact}>
          <div class="mb-3 flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Wrench size={18} />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary dark:text-white">
                Contingencia — avería en ruta
              </p>
              <p class="text-xs text-text-secondary">
                Reporta una avería, interrumpe la ruta y relanza el optimizador con la flota restante.
              </p>
            </div>
          </div>
        </Show>

        <select
          class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:bg-dark-surface-hover dark:border-dark-border"
          value={selected()}
          onChange={(e) => setSelected(e.currentTarget.value)}
        >
          <option value="">Vehículo en ruta…</option>
          {inRouteVehicles().map((v) => (
            <option value={v.id}>{v.id}</option>
          ))}
        </select>

        <Button
          variant="outline"
          size="sm"
          class="gap-2 border-amber-300 text-amber-800 hover:bg-amber-100"
          icon={<Wrench size={14} />}
          disabled={simulationState.isOptimizing || inRouteVehicles().length === 0}
          onClick={() => void handleReport()}
        >
          {simulationState.isOptimizing ? 'Recalculando…' : 'Reportar avería'}
        </Button>

        <Show when={error()}>
          <p class="w-full text-xs text-red-600">{error()}</p>
        </Show>
      </div>
    </Show>
  );
}

export function ContingencyResultBanner() {
  const contingency = () => simulationState.lastContingency;
  const comparison = () => simulationState.contingencyComparison;

  return (
    <Show when={contingency()}>
      {(result) => (
        <div class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div class="flex items-start gap-3">
            <AlertTriangle size={18} class="mt-0.5 shrink-0 text-amber-600" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {result().message}
              </p>
              <p class="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                Incidente #{result().incident.id} · {result().skippedWaypoints} paradas omitidas ·{' '}
                {result().pendingPoints} puntos reasignados
              </p>
              <Show when={comparison()}>
                {(cmp) => (
                  <p class="mt-2 text-xs font-medium text-text-secondary">
                    KPI comparativo: {cmp().beforeDistanceKm} km → {cmp().afterDistanceKm} km (
                    {cmp().distanceDeltaKm >= 0 ? '+' : ''}
                    {cmp().distanceDeltaKm} km) · {cmp().remainingVehicles} vehículos · simulación #
                    {result().recalculation?.simulationId ?? '—'}
                  </p>
                )}
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
