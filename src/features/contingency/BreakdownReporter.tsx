import { Show, createSignal } from 'solid-js';
import { AlertTriangle, Wrench } from 'lucide-solid';
import { Button, Modal } from '../../design-system/components';
import { canReportBreakdown } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { reportBreakdown, simulationState } from '../../core/stores/simulationStore';
import {
  dismissOperatorContingencyError,
  operatorContingencyState,
  submitOperatorBreakdown,
} from '../../core/stores/contingencyStore';

interface BreakdownReporterProps {
  vehicles: Array<{ id: string; routeId?: number | null; status?: string }>;
  onComplete?: () => void;
  compact?: boolean;
  /** Operador en campo: API directa, confirmación y mensajes accesibles. */
  variant?: 'planner' | 'operator';
}

export function BreakdownReporter(props: BreakdownReporterProps) {
  const variant = () => props.variant ?? 'planner';
  const [selected, setSelected] = createSignal('');
  const [notes, setNotes] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [confirmOpen, setConfirmOpen] = createSignal(false);

  const inRouteVehicles = () =>
    props.vehicles.filter((vehicle) => !vehicle.status || vehicle.status === 'en-ruta');

  const resolvedVehicleId = () => {
    const list = inRouteVehicles();
    if (variant() === 'operator' && list.length === 1) return list[0]!.id;
    return selected() || list[0]?.id || '';
  };

  const resolvedVehicle = () => inRouteVehicles().find((vehicle) => vehicle.id === resolvedVehicleId());

  const isSubmitting = () =>
    variant() === 'operator' ? operatorContingencyState.reporting : simulationState.isOptimizing;

  const requestReport = () => {
    const vehicleId = resolvedVehicleId();
    if (!vehicleId) {
      setError('No hay vehículo en ruta para reportar la avería.');
      return;
    }
    setError(null);
    if (variant() === 'operator') {
      dismissOperatorContingencyError();
      setConfirmOpen(true);
      return;
    }
    void executeReport();
  };

  const executeReport = async () => {
    const vehicleId = resolvedVehicleId();
    if (!vehicleId) return;
    setConfirmOpen(false);
    setError(null);

    try {
      const routeId = resolvedVehicle()?.routeId ?? undefined;
      const description =
        notes().trim() ||
        (variant() === 'operator'
          ? `Avería reportada por conductor — ${vehicleId}`
          : `Avería reportada desde la UI — ${vehicleId}`);

      if (variant() === 'operator') {
        await submitOperatorBreakdown({ vehicleId, routeId, description });
      } else {
        await reportBreakdown(vehicleId, routeId);
      }
      props.onComplete?.();
    } catch (err) {
      if (variant() === 'operator') {
        setError(operatorContingencyState.error ?? 'No se pudo registrar la avería.');
      } else {
        setError(err instanceof Error ? err.message : 'Error al reportar avería');
      }
    }
  };

  const fieldId = () => `breakdown-vehicle-${variant()}`;

  return (
    <Show when={canReportBreakdown(authUser()?.role)}>
      <div
        class={
          props.compact
            ? 'flex flex-wrap items-center gap-2'
            : 'rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/20'
        }
        data-testid="breakdown-reporter"
      >
        <Show when={!props.compact}>
          <div class="mb-3 flex items-start gap-3">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"
              aria-hidden="true"
            >
              <Wrench size={18} />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary dark:text-white">
                {variant() === 'operator' ? 'Reportar avería en ruta' : 'Contingencia — avería en ruta'}
              </p>
              <p class="text-xs text-text-secondary">
                {variant() === 'operator'
                  ? 'Avisa a planificación si tu vehículo no puede continuar la ruta.'
                  : 'Reporta una avería, interrumpe la ruta y relanza el optimizador con la flota restante.'}
              </p>
            </div>
          </div>
        </Show>

        <Show
          when={variant() === 'operator' && inRouteVehicles().length === 1}
          fallback={
            <div class="min-w-[10rem] flex-1">
              <label class="sr-only" for={fieldId()}>
                Vehículo con avería
              </label>
              <select
                id={fieldId()}
                class="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-text-secondary dark:border-dark-border dark:bg-dark-surface-hover"
                value={selected()}
                onChange={(event) => setSelected(event.currentTarget.value)}
                aria-describedby={`${fieldId()}-help`}
              >
                <option value="">Selecciona tu vehículo…</option>
                {inRouteVehicles().map((vehicle) => (
                  <option value={vehicle.id}>{vehicle.id}</option>
                ))}
              </select>
            </div>
          }
        >
          <p id={`${fieldId()}-help`} class="text-sm font-medium text-text-primary dark:text-white">
            Vehículo: {inRouteVehicles()[0]?.id}
          </p>
        </Show>

        <Show when={variant() === 'operator' && !props.compact}>
          <div class="w-full">
            <label class="mb-1 block text-xs font-semibold text-text-muted" for={`${fieldId()}-notes`}>
              Detalle (opcional)
            </label>
            <textarea
              id={`${fieldId()}-notes`}
              rows={2}
              class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary dark:border-dark-border dark:bg-dark-surface-hover dark:text-white"
              placeholder="Ej. falla de motor, neumático pinchado…"
              value={notes()}
              onInput={(event) => setNotes(event.currentTarget.value)}
            />
          </div>
        </Show>

        <Button
          variant="outline"
          size={variant() === 'operator' ? 'lg' : 'sm'}
          class={`gap-2 border-amber-300 text-amber-800 hover:bg-amber-100 ${
            variant() === 'operator' ? 'min-h-12' : ''
          }`}
          icon={<Wrench size={variant() === 'operator' ? 18 : 14} />}
          disabled={isSubmitting() || inRouteVehicles().length === 0}
          aria-describedby={error() ? `${fieldId()}-error` : undefined}
          onClick={() => requestReport()}
        >
          {isSubmitting() ? 'Enviando reporte…' : 'Reportar avería'}
        </Button>

        <Show when={error()}>
          <p id={`${fieldId()}-error`} class="w-full text-xs text-red-600" role="alert">
            {error()}
          </p>
        </Show>
      </div>

      <Modal
        open={confirmOpen()}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar reporte de avería"
        size="sm"
      >
        <p class="text-sm text-text-secondary">
          ¿Confirmas la avería en <strong class="text-text-primary">{resolvedVehicleId()}</strong>? Planificación
          será notificada y revisará los puntos pendientes de tu ruta.
        </p>
        <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" class="min-h-11" data-modal-autofocus onClick={() => void executeReport()}>
            Sí, reportar avería
          </Button>
        </div>
      </Modal>
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
