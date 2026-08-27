import { For, Show, createSignal, onMount } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, CalendarPlus, RefreshCw, Truck } from 'lucide-solid';
import { Button } from '../../design-system/components';
import type { KpiMetrics } from '../../data/types/simulation';
import { uncoveredAlertMessage } from '../../core/utils/landfillUx';
import { deferUncoveredPoints } from '../../core/api/planning';
import { tomorrowIso } from '../../core/planning/planningUx';
import { executeOptimization } from '../../core/stores/optimizationStore';
import { globalToast } from '../../core/stores/toastStore';

interface UncoveredPointsActionsPanelProps {
  kpis: KpiMetrics;
  dailyPlanId?: number;
  operationDate: string;
  onDeferred?: () => void;
}

export function UncoveredPointsActionsPanel(props: UncoveredPointsActionsPanelProps) {
  const [busy, setBusy] = createSignal<'defer' | 'replan' | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  const message = () => uncoveredAlertMessage(props.kpis);
  const codes = () => props.kpis.uncoveredPointCodes ?? [];
  const count = () => props.kpis.uncoveredPoints ?? codes().length;

  onMount(() => setNotice(null));

  const handleReplan = async () => {
    setBusy('replan');
    setNotice(null);
    try {
      await executeOptimization();
      globalToast.addToast('Reoptimización iniciada con la flota actual', 'info');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo replanificar');
    } finally {
      setBusy(null);
    }
  };

  const handleDeferTomorrow = async () => {
    if (!props.dailyPlanId) {
      setNotice('No hay plan del día cargado');
      return;
    }
    setBusy('defer');
    setNotice(null);
    try {
      const result = await deferUncoveredPoints(props.dailyPlanId, tomorrowIso(props.operationDate));
      setNotice(result.message);
      globalToast.addToast(result.message, 'success');
      props.onDeferred?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudieron mover los pendientes');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Show when={message()}>
      <div
        class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
        data-testid="uncovered-points-actions"
        role="alert"
      >
        <div class="flex items-start gap-2.5 text-sm text-amber-950 dark:text-amber-100">
          <AlertTriangle size={18} class="mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{message()}</p>
            <Show when={codes().length > 0}>
              <ul class="mt-2 space-y-1 text-xs">
                <For each={codes()}>
                  {(code) => (
                    <li class="rounded-md bg-amber-100/80 px-2 py-1 font-mono dark:bg-amber-950/50">
                      {code}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <p class="mt-2 text-xs opacity-90">
              {count()} contenedor(es) exceden la jornada o la capacidad de la flota actual.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                icon={<RefreshCw size={14} />}
                loading={busy() === 'replan'}
                data-testid="uncovered-action-replan"
                onClick={() => void handleReplan()}
              >
                Replanificar
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<CalendarPlus size={14} />}
                loading={busy() === 'defer'}
                disabled={!props.dailyPlanId}
                data-testid="uncovered-action-defer"
                onClick={() => void handleDeferTomorrow()}
              >
                Mover a mañana
              </Button>
              <A href="/vehicles">
                <Button size="sm" variant="outline" icon={<Truck size={14} />}>
                  Revisar flota
                </Button>
              </A>
            </div>
            <Show when={notice()}>
              <p class="mt-2 text-xs font-medium">{notice()}</p>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
