import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { RefreshCw } from 'lucide-solid';
import { Button, Card, LoadingPanel } from '../../design-system/components';
import { ApiError } from '../../core/api/client';
import {
  cancelCalibrationJob,
  fetchAcoSensitivity,
  fetchCalibrationJob,
  fetchObjectiveSweep,
  startCalibrationJob,
  type AcoSensitivityPayload,
  type CalibrationJobSnapshot,
  type CalibrationSweep,
  type ObjectiveSweepPayload,
} from '../../core/api/benchmark';
import { fetchScenarios } from '../../core/api/simulation';
import { useLocale } from '../../core/i18n/solid';
import type { Scenario } from '../../data/types/simulation';
import { SettingsShell } from './SettingsShell';
import { CalibrationObjectiveResults } from './CalibrationObjectiveResults';
import { CalibrationProgress } from './CalibrationProgress';
import { CalibrationResults } from './CalibrationResults';
import { CalibrationRunControls } from './CalibrationRunControls';
import {
  CALIBRATION_MAX_WAIT_MS,
  CALIBRATION_POLL_MS,
  defaultRunConfig,
  isJobRunning,
  jobRequestFor,
  pendingSnapshot,
  viewStateFor,
  wasServedFromCache,
  type CalibrationRunConfig,
} from './calibrationRunUx';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isMissingCache(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * Calibración del motor (`/settings/calibration`, Fase 13 · decisión D-C).
 *
 * Ejecuta los dos barridos del ACO (sensibilidad y pesos del objetivo) como job
 * asíncrono con progreso real y cancelación, y renderiza los resultados desde la
 * caché (fuente de verdad). Métrica primaria: **distancia optimizada**.
 */
export default function CalibrationPage() {
  const tr = useLocale();

  const [config, setConfig] = createSignal<CalibrationRunConfig>(defaultRunConfig());
  const [scenarios, setScenarios] = createSignal<Scenario[]>([]);
  const [sensitivity, setSensitivity] = createSignal<AcoSensitivityPayload | undefined>();
  const [objective, setObjective] = createSignal<ObjectiveSweepPayload | undefined>();
  const [loadingCache, setLoadingCache] = createSignal(true);
  const [job, setJob] = createSignal<CalibrationJobSnapshot | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [cancelled, setCancelled] = createSignal(false);
  const [reusedCache, setReusedCache] = createSignal(false);
  const [tab, setTab] = createSignal<CalibrationSweep>('sensitivity');

  let pollTimer: number | undefined;
  let waitStartedAt = 0;

  const stopPolling = () => {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
  onCleanup(stopPolling);

  const loadCache = async () => {
    setLoadingCache(true);
    const [sens, obj] = await Promise.all([
      fetchAcoSensitivity().catch((cause: unknown) => {
        if (!isMissingCache(cause)) setError(errorMessage(cause, 'No se pudo leer la sensibilidad.'));
        return undefined;
      }),
      fetchObjectiveSweep().catch((cause: unknown) => {
        if (!isMissingCache(cause)) setError(errorMessage(cause, 'No se pudo leer el barrido de pesos.'));
        return undefined;
      }),
    ]);
    setSensitivity(sens);
    setObjective(obj);
    if (sens) setTab((current) => (obj ? current : 'sensitivity'));
    else if (obj) setTab('objective');
    setLoadingCache(false);
  };

  onMount(() => {
    void fetchScenarios()
      .then(setScenarios)
      .catch(() => setScenarios([]));
    void loadCache();
  });

  const handleFinished = async (snapshot: CalibrationJobSnapshot) => {
    stopPolling();
    if (snapshot.status === 'completed') {
      setReusedCache(wasServedFromCache(snapshot, config()));
      setTab((snapshot.sweep as CalibrationSweep | null) ?? config().mode);
      await loadCache();
      return;
    }
    if (snapshot.status === 'cancelled') {
      setCancelled(true);
      return;
    }
    if (snapshot.status === 'failed') {
      setError(snapshot.error ?? tr('calibration.failed'));
    }
  };

  const poll = async (jobId: string) => {
    try {
      const snapshot = await fetchCalibrationJob(jobId);
      setJob(snapshot);

      if (Date.now() - waitStartedAt > CALIBRATION_MAX_WAIT_MS) {
        await cancelCalibrationJob(jobId).catch(() => undefined);
        stopPolling();
        setError('Tiempo de espera agotado esperando el barrido.');
        return;
      }
      if (!isJobRunning(snapshot.status)) {
        await handleFinished(snapshot);
      }
    } catch (cause) {
      stopPolling();
      setError(errorMessage(cause, 'Se perdió la conexión con el job de calibración.'));
    }
  };

  const run = async () => {
    setError(null);
    setCancelled(false);
    setReusedCache(false);
    stopPolling();
    try {
      const { jobId } = await startCalibrationJob(config().mode, jobRequestFor(config()));
      waitStartedAt = Date.now();
      setJob(pendingSnapshot(jobId, config().mode));
      pollTimer = window.setInterval(() => void poll(jobId), CALIBRATION_POLL_MS);
      await poll(jobId);
    } catch (cause) {
      setError(errorMessage(cause, tr('calibration.failed')));
    }
  };

  const cancel = async () => {
    const current = job();
    if (!current) return;
    try {
      await cancelCalibrationJob(current.jobId);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo cancelar el barrido.'));
    }
  };

  const hasResults = createMemo(() =>
    tab() === 'sensitivity' ? Boolean(sensitivity()) : Boolean(objective()),
  );
  const state = createMemo(() =>
    viewStateFor({ hasResults: hasResults(), job: job(), error: error() }),
  );
  const retry = () => void run();

  return (
    <SettingsShell active="calibration" testId="calibration-page">
      <div>
        <h2 class="font-heading text-lg font-semibold text-text-primary dark:text-white">
          {tr('calibration.title')}
        </h2>
        <p class="mt-1 text-sm text-text-muted">{tr('calibration.subtitle')}</p>
      </div>

      <CalibrationRunControls
        config={config()}
        scenarios={scenarios()}
        status={job()?.status ?? null}
        onChange={(patch) => setConfig((current) => ({ ...current, ...patch }))}
        onRun={() => void run()}
      />

      <Show when={state() === 'ejecutando' && job()}>
        <CalibrationProgress job={job()} onCancel={() => void cancel()} />
      </Show>

      <Show when={error()}>
        <Card class="border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-red-700 dark:text-red-300" data-testid="calibration-error">
              {error()}
            </p>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={14} />}
              data-testid="calibration-retry-btn"
              onClick={retry}
            >
              {tr('calibration.retry')}
            </Button>
          </div>
        </Card>
      </Show>

      <Show when={cancelled()}>
        <Card class="border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5">
          <p class="text-sm text-amber-700 dark:text-amber-300" data-testid="calibration-cancelled">
            {tr('calibration.cancelled')}
          </p>
        </Card>
      </Show>

      <Show when={reusedCache() && !cancelled()}>
        <Card class="border-fero-blue/30 bg-fero-blue/5">
          <p class="text-sm text-fero-blue" data-testid="calibration-reused-cache">
            {tr('calibration.reusedCache')}
          </p>
        </Card>
      </Show>

      <Show when={loadingCache()}>
        <LoadingPanel label={tr('calibration.loading')} indeterminate detail={tr('calibration.subtitle')} />
      </Show>

      <Show when={!loadingCache()}>
        <div class="flex flex-wrap gap-1 border-b border-border dark:border-dark-border">
          <button
            type="button"
            data-testid="calibration-result-tab-sensitivity"
            aria-current={tab() === 'sensitivity' ? 'page' : undefined}
            onClick={() => setTab('sensitivity')}
            class={`px-3 py-2 text-sm font-medium transition-colors ${
              tab() === 'sensitivity' ? 'text-fero-blue' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tr('calibration.tab.sensitivity')}
          </button>
          <button
            type="button"
            data-testid="calibration-result-tab-objective"
            aria-current={tab() === 'objective' ? 'page' : undefined}
            onClick={() => setTab('objective')}
            class={`px-3 py-2 text-sm font-medium transition-colors ${
              tab() === 'objective' ? 'text-fero-blue' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tr('calibration.tab.objective')}
          </button>
        </div>

        <Show
          when={hasResults()}
          fallback={
            <Card data-testid="calibration-empty">
              <p class="text-sm font-medium text-text-primary">{tr('calibration.noData')}</p>
              <p class="mt-1 text-xs text-text-muted">{tr('calibration.noDataHint')}</p>
            </Card>
          }
        >
          <Show
            when={tab() === 'sensitivity'}
            fallback={<CalibrationObjectiveResults payload={objective()!} />}
          >
            <CalibrationResults payload={sensitivity()!} />
          </Show>
        </Show>
      </Show>
    </SettingsShell>
  );
}
