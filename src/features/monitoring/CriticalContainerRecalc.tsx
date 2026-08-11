import { For, Show, createMemo, createSignal } from 'solid-js';
import { Trash2 } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { recalcCriticalContainer } from '../../core/api/contingencies';
import { canReportBreakdown } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import type { ContainerCollection } from '../../core/types/geo';

interface CriticalContainerRecalcProps {
  containers?: ContainerCollection;
  dailyPlanId?: number;
  onComplete?: () => void;
  compact?: boolean;
}

export function CriticalContainerRecalc(props: CriticalContainerRecalcProps) {
  const [selected, setSelected] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const criticalContainers = createMemo(() =>
    (props.containers?.features ?? [])
      .filter((feature) => (feature.properties?.fillLevel ?? 0) >= 80)
      .sort((a, b) => (b.properties?.fillLevel ?? 0) - (a.properties?.fillLevel ?? 0))
      .slice(0, 12),
  );

  const handleRecalc = async () => {
    const code = selected() || criticalContainers()[0]?.properties?.id;
    if (!code) {
      setError('No hay contenedores críticos para recalcular');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await recalcCriticalContainer({
        collectionPointCode: code,
        dailyPlanId: props.dailyPlanId,
      });
      setMessage(result.message);
      props.onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al recalcular rutas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Show when={canReportBreakdown(authUser()?.role)}>
      <div
        class={
          props.compact
            ? 'flex flex-wrap items-center gap-2'
            : 'rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900/40 dark:bg-red-950/20'
        }
      >
        <Show when={!props.compact}>
          <div class="mb-3 flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <Trash2 size={18} />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary dark:text-white">
                Recálculo operativo — contenedor crítico
              </p>
              <p class="text-xs text-text-secondary">
                Reoptimiza solo las paradas pendientes restantes del día sin reportar avería.
              </p>
            </div>
          </div>
        </Show>

        <select
          class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary dark:border-dark-border dark:bg-dark-surface-hover"
          value={selected()}
          onChange={(e) => setSelected(e.currentTarget.value)}
        >
          <option value="">Contenedor crítico…</option>
          <For each={criticalContainers()}>
            {(feature) => (
              <option value={feature.properties.id}>
                {feature.properties.id} · {feature.properties.fillLevel}%
              </option>
            )}
          </For>
        </select>

        <Button
          variant="outline"
          size="sm"
          class="gap-2 border-red-300 text-red-700 hover:bg-red-100"
          icon={<Trash2 size={14} />}
          disabled={loading() || criticalContainers().length === 0}
          onClick={() => void handleRecalc()}
        >
          {loading() ? 'Recalculando…' : 'Recalcular pendientes'}
        </Button>

        <Show when={message()}>
          <p class="w-full text-xs text-fero-green-dark">{message()}</p>
        </Show>
        <Show when={error()}>
          <p class="w-full text-xs text-red-600">{error()}</p>
        </Show>
      </div>
    </Show>
  );
}
