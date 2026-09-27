import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Badge, Button, Card, ProgressBar } from '../../design-system/components';
import { XCircle } from 'lucide-solid';
import { useLocale } from '../../core/i18n/solid';
import type { CalibrationJobSnapshot } from '../../core/api/benchmark';
import {
  etaSeconds,
  formatEta,
  progressPercent,
  runCounterLabel,
  runPhaseLabel,
  statusLabelKey,
  statusVariant,
} from './calibrationRunUx';

interface CalibrationProgressProps {
  job: CalibrationJobSnapshot | null;
  onCancel: () => void;
}

const TICK_MS = 1000;

/** Progreso real del barrido: barra, `k/total`, corrida en curso, ETA y cancelación. */
export function CalibrationProgress(props: CalibrationProgressProps) {
  const tr = useLocale();
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    onCleanup(() => window.clearInterval(timer));
  });

  const eta = () => formatEta(etaSeconds(props.job, now()));

  return (
    <Card data-testid="calibration-progress">
      <div class="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        <div class="flex items-center gap-2">
          <Badge variant={statusVariant(props.job?.status)}>{tr(statusLabelKey(props.job?.status))}</Badge>
          <span class="text-sm font-medium text-text-primary">
            {runPhaseLabel(props.job) ?? tr('calibration.running')}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <Show when={runCounterLabel(props.job)}>
            <span class="text-xs text-text-muted" data-testid="calibration-run-counter">
              {tr('calibration.progress.job')} {runCounterLabel(props.job)}
            </span>
          </Show>
          <Show when={eta()}>
            <span class="text-xs text-text-muted" data-testid="calibration-eta">
              {tr('calibration.progress.eta')}: {eta()}
            </span>
          </Show>
        </div>
      </div>

      <div class="mt-3">
        <ProgressBar value={progressPercent(props.job)} showLabel color="blue" />
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-text-muted">{tr('calibration.cancelHint')}</span>
        <Button
          variant="outline"
          size="sm"
          icon={<XCircle size={14} />}
          data-testid="calibration-cancel-btn"
          onClick={props.onCancel}
        >
          {tr('calibration.cancel')}
        </Button>
      </div>
    </Card>
  );
}
