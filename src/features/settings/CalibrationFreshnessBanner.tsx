import { Show } from 'solid-js';
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from 'lucide-solid';
import { Button, Card } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import type { CalibrationCacheState } from '../../core/api/benchmark';

interface CalibrationFreshnessBannerProps {
  state: CalibrationCacheState | undefined;
  /** Sello de la caché tal cual se guardó (para depurar de dónde viene). */
  fingerprint?: string | null;
  onRecompute: () => void;
  disabled?: boolean;
}

const TONE: Record<CalibrationCacheState, string> = {
  fresh: 'border-fero-green/30 bg-fero-green/5',
  stale: 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5',
  unknown: 'border-border bg-app',
};

/**
 * Estado del sello de instancia de la caché: evita enseñar números de otra BD.
 *
 * `stale` = se generó con otra instancia (p. ej. antes de un `just db-reset`);
 * `unknown` = caché anterior a esta versión, sin sello.
 */
export function CalibrationFreshnessBanner(props: CalibrationFreshnessBannerProps) {
  const tr = useLocale();
  const state = () => props.state ?? 'unknown';

  const message = () =>
    state() === 'fresh' ? tr('calibration.freshness.fresh') : tr(`calibration.freshness.${state()}`);

  const hint = () =>
    state() === 'fresh'
      ? `${tr('calibration.freshness.stamp')}: ${props.fingerprint ?? '—'}`
      : tr(`calibration.freshness.${state()}Hint`);

  return (
    <Card class={TONE[state()]} data-testid={`calibration-freshness-${state()}`}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-start gap-2">
          {state() === 'fresh' ? (
            <CheckCircle2 size={16} class="mt-0.5 shrink-0 text-fero-green-dark" />
          ) : state() === 'stale' ? (
            <AlertTriangle size={16} class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <HelpCircle size={16} class="mt-0.5 shrink-0 text-text-muted" />
          )}
          <div class="min-w-0">
            <p class="text-sm font-medium text-text-primary" data-testid="calibration-freshness-message">
              {message()}
            </p>
            <p class="mt-0.5 text-xs text-text-muted">{hint()}</p>
          </div>
        </div>
        <Show when={state() !== 'fresh'}>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} />}
            disabled={props.disabled}
            data-testid="calibration-recompute-btn"
            onClick={props.onRecompute}
          >
            {tr('calibration.freshness.recompute')}
          </Button>
        </Show>
      </div>
    </Card>
  );
}
