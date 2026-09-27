import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { ArrowLeft, RefreshCw } from 'lucide-solid';
import { A } from '@solidjs/router';
import { Button, Card, ConfirmDialog, LoadingPanel } from '../../design-system/components';
import { ApiError } from '../../core/api/client';
import {
  cancelCalibrationJob,
  fetchAcoSensitivity,
  fetchAcoValidation,
  fetchCalibrationHistory,
  fetchCalibrationJob,
  fetchCalibrationMethodEvidence,
  fetchCalibrationRun,
  fetchObjectiveSweep,
  startCalibrationJob,
  startCalibrationMethodJob,
  type AcoSensitivityPayload,
  type AcoValidationPayload,
  type CalibrationHistoryPage,
  type CalibrationHistoryRun,
  type CalibrationJobSnapshot,
  type CalibrationMethodEvidence,
  type ObjectiveSweepPayload,
} from '../../core/api/benchmark';
import { fetchScenarios } from '../../core/api/simulation';
import { updateAlgorithmSettings } from '../../core/api/admin';
import { useLocale } from '../../core/i18n/solid';
import { globalToast } from '../../core/stores/toastStore';
import type { Scenario } from '../../data/types/simulation';
import { SettingsShell } from './SettingsShell';
import { AcoValidationPanel } from './AcoValidationPanel';
import { CalibrationAdvicePanel } from './CalibrationAdvicePanel';
import { CalibrationHistoryPanel } from './CalibrationHistoryPanel';
import { CalibrationObjectiveResults } from './CalibrationObjectiveResults';
import { CalibrationProgress } from './CalibrationProgress';
import { CalibrationResults } from './CalibrationResults';
import { CalibrationRunControls } from './CalibrationRunControls';
import { MethodEvidencePanel } from './MethodEvidencePanel';
import { advisorProfileParams, isStandardProfile } from './calibrationAdvisorUx';
import { profileLabel } from './acoValidationUx';
import {
  CALIBRATION_MAX_WAIT_MS,
  CALIBRATION_POLL_MS,
  defaultRunConfig,
  isJobRunning,
  jobRequestFor,
  methodJobRequestFor,
  pendingSnapshot,
  viewStateFor,
  wasServedFromCache,
  type CalibrationResultTab,
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
 * Ejecuta los dos barridos del ACO como job asíncrono con progreso y cancelación, y
 * renderiza la evidencia en caché. Avisa si esa evidencia es de **otra instancia** de BD
 * (sello de instancia), recomienda un perfil a partir de lo medido y permite abrir
 * corridas anteriores guardadas en la BD. Métrica primaria: **distancia optimizada**.
 */
export default function CalibrationPage() {
  const tr = useLocale();

  const [config, setConfig] = createSignal<CalibrationRunConfig>(defaultRunConfig());
  const [scenarios, setScenarios] = createSignal<Scenario[]>([]);
  const [sensitivity, setSensitivity] = createSignal<AcoSensitivityPayload | undefined>();
  const [objective, setObjective] = createSignal<ObjectiveSweepPayload | undefined>();
  const [validation, setValidation] = createSignal<AcoValidationPayload | undefined>();
  const [loadingCache, setLoadingCache] = createSignal(true);
  const [job, setJob] = createSignal<CalibrationJobSnapshot | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [cancelled, setCancelled] = createSignal(false);
  const [reusedCache, setReusedCache] = createSignal(false);
  const [validating, setValidating] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [applied, setApplied] = createSignal<string | null>(null);
  const [applyError, setApplyError] = createSignal<string | null>(null);
  /** Confirmación previa a escribir la combinación recomendada en el motor. */
  const [confirmApplyOpen, setConfirmApplyOpen] = createSignal(false);
  const [tab, setTab] = createSignal<CalibrationResultTab>('sensitivity');
  const [history, setHistory] = createSignal<CalibrationHistoryPage | null>(null);
  const [historyRun, setHistoryRun] = createSignal<CalibrationHistoryRun | null>(null);
  /** Evidencia del protocolo metodológico leída de la BD (0 CPU). */
  const [methodEvidence, setMethodEvidence] = createSignal<CalibrationMethodEvidence | null>(null);
  const [methodError, setMethodError] = createSignal<string | null>(null);
  const [applyingMethod, setApplyingMethod] = createSignal(false);
  const [appliedMethod, setAppliedMethod] = createSignal<string | null>(null);
  const [applyMethodError, setApplyMethodError] = createSignal<string | null>(null);
  /** Confirmación previa a escribir el perfil del protocolo en el motor. */
  const [confirmApplyMethodOpen, setConfirmApplyMethodOpen] = createSignal(false);
  /** Corrida de validación abierta desde el historial (vive en su panel, no en las pestañas). */
  const [validationRun, setValidationRun] = createSignal<CalibrationHistoryRun | null>(null);

  let pollTimer: number | undefined;
  let waitStartedAt = 0;

  const stopPolling = () => {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
  onCleanup(stopPolling);

  const loadHistory = async () => {
    try {
      setHistory(await fetchCalibrationHistory());
    } catch {
      setHistory(null);
    }
  };

  const loadMethodEvidence = async () => {
    try {
      setMethodEvidence(await fetchCalibrationMethodEvidence());
      setMethodError(null);
    } catch (cause) {
      setMethodEvidence(null);
      setMethodError(errorMessage(cause, tr('calibration.method.noEvidence')));
    }
  };

  const loadCache = async () => {
    setLoadingCache(true);
    const [sens, obj, val] = await Promise.all([
      fetchAcoSensitivity().catch((cause: unknown) => {
        if (!isMissingCache(cause)) setError(errorMessage(cause, 'No se pudo leer la sensibilidad.'));
        return undefined;
      }),
      fetchObjectiveSweep().catch((cause: unknown) => {
        if (!isMissingCache(cause))
          setError(errorMessage(cause, 'No se pudo leer el barrido de pesos.'));
        return undefined;
      }),
      fetchAcoValidation().catch((cause: unknown) => {
        if (!isMissingCache(cause))
          setError(errorMessage(cause, 'No se pudo leer la validación de la combinación.'));
        return undefined;
      }),
    ]);
    setSensitivity(sens);
    setObjective(obj);
    setValidation(val);
    if (sens) setTab((current) => (obj ? current : 'sensitivity'));
    else if (obj) setTab('objective');
    await loadMethodEvidence();
    setLoadingCache(false);
  };

  onMount(() => {
    void fetchScenarios()
      .then(setScenarios)
      .catch(() => setScenarios([]));
    void loadCache();
    void loadHistory();
  });

  const handleFinished = async (snapshot: CalibrationJobSnapshot) => {
    stopPolling();
    if (snapshot.status === 'completed') {
      setReusedCache(wasServedFromCache(snapshot, config()));
      setHistoryRun(null);
      setValidationRun(null);
      // La validación no tiene pestaña de resultados: se muestra en su propio panel.
      if (snapshot.sweep === 'sensitivity' || snapshot.sweep === 'objective') {
        setTab(snapshot.sweep);
      }
      await Promise.all([loadCache(), loadHistory()]);
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
      const { jobId } =
        config().mode === 'method'
          ? await startCalibrationMethodJob(methodJobRequestFor(config()))
          : await startCalibrationJob(config().mode, jobRequestFor(config()));
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

  /** Valida la combinación recomendada contra el perfil estándar (2 corridas). */
  const validate = async () => {
    const payload = sensitivity();
    if (!payload) return;
    setError(null);
    setCancelled(false);
    setReusedCache(false);
    setValidationRun(null);
    setValidating(true);
    stopPolling();
    try {
      const { jobId } = await startCalibrationJob('validation', {
        scenarioId: config().scenarioId,
        seed: config().seed,
        refresh: true,
        profile: advisorProfileParams(payload),
      });
      waitStartedAt = Date.now();
      setJob(pendingSnapshot(jobId, 'validation'));
      pollTimer = window.setInterval(() => void poll(jobId), CALIBRATION_POLL_MS);
      await poll(jobId);
    } catch (cause) {
      setError(errorMessage(cause, tr('calibration.failed')));
    } finally {
      setValidating(false);
    }
  };

  const viewHistoryRun = async (runId: string) => {
    try {
      const run = await fetchCalibrationRun(runId);
      if (run.sweep === 'validation') {
        // La validación no tiene pestaña de resultados propia.
        setHistoryRun(null);
        setValidationRun(run);
        return;
      }
      setValidationRun(null);
      setHistoryRun(run);
      if (run.sweep === 'sensitivity' || run.sweep === 'objective') setTab(run.sweep);
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo abrir la corrida histórica.'));
    }
  };

  const selectTab = (next: CalibrationResultTab) => {
    setHistoryRun(null);
    setTab(next);
  };

  const currentPayload = createMemo(() =>
    tab() === 'sensitivity' ? sensitivity() : objective(),
  );
  const shownPayload = createMemo(() => historyRun()?.payload ?? currentPayload());
  const hasResults = createMemo(() => Boolean(shownPayload()));
  const state = createMemo(() =>
    viewStateFor({ hasResults: hasResults(), job: job(), error: error() }),
  );
  const retry = () => void run();

  /**
   * Escribe la combinación recomendada en la configuración del motor
   * (`Configuración → Algoritmo`), que es lo que aplica la siguiente optimización.
   */
  const applyRecommended = async () => {
    const payload = sensitivity();
    if (!payload) return;
    setApplyError(null);
    setApplied(null);
    setApplying(true);
    try {
      const params = advisorProfileParams(payload);
      const updated = await updateAlgorithmSettings({
        acoAnts: params.acoAnts,
        acoIterations: params.acoIterations,
        acoAlpha: params.acoAlpha,
        acoBeta: params.acoBeta,
        acoRho: params.acoRho,
        pheromoneQ: params.pheromoneQ,
      });
      // Se confirma con lo que el motor guardó, no con lo que se pidió.
      const message = `${tr('calibration.advice.applied')} ${profileLabel({
        acoAnts: updated.acoAnts,
        acoIterations: updated.acoIterations,
        acoAlpha: updated.acoAlpha,
        acoBeta: updated.acoBeta,
        acoRho: updated.acoRho,
        pheromoneQ: updated.pheromoneQ,
      })}`;
      setApplied(message);
      globalToast.addToast(message, 'success');
    } catch (cause) {
      const message = errorMessage(cause, tr('calibration.advice.applyError'));
      setApplyError(message);
      globalToast.addToast(message, 'error');
    } finally {
      setApplying(false);
    }
  };

  /**
   * Aplica el perfil recomendado por el protocolo metodológico a la configuración del motor.
   */
  const applyMethodRecommended = async () => {
    const evidence = methodEvidence();
    if (!evidence) return;
    setApplyMethodError(null);
    setAppliedMethod(null);
    setApplyingMethod(true);
    try {
      const profile = evidence.recommendation.profile;
      const updated = await updateAlgorithmSettings({
        acoAnts: profile.acoAnts,
        acoIterations: profile.acoIterations,
        acoAlpha: profile.acoAlpha,
        acoBeta: profile.acoBeta,
        acoRho: profile.acoRho,
        pheromoneQ: profile.pheromoneQ,
      });
      // Se confirma con lo que el motor guardó, no con lo que se pidió.
      const message = `${tr('calibration.method.applied')} ${profileLabel({
        acoAnts: updated.acoAnts,
        acoIterations: updated.acoIterations,
        acoAlpha: updated.acoAlpha,
        acoBeta: updated.acoBeta,
        acoRho: updated.acoRho,
        pheromoneQ: updated.pheromoneQ,
      })}`;
      setAppliedMethod(message);
      globalToast.addToast(message, 'success');
    } catch (cause) {
      const message = errorMessage(cause, tr('calibration.method.applyError'));
      setApplyMethodError(message);
      globalToast.addToast(message, 'error');
    } finally {
      setApplyingMethod(false);
    }
  };

  /** Combinación que la vista recomienda; `null` si ya coincide con el perfil estándar. */
  const recommendedProfile = createMemo(() => {
    const payload = sensitivity();
    if (!payload) return null;
    const params = advisorProfileParams(payload);
    return isStandardProfile(params) ? null : params;
  });

  /** Validación a mostrar: la abierta desde el historial o la vigente en caché. */
  const shownValidation = createMemo<AcoValidationPayload | undefined>(() => {
    const run = validationRun();
    if (!run) return validation();
    return {
      ...(run.payload as AcoValidationPayload),
      instanceFingerprint: run.instanceFingerprint,
      cacheState: run.cacheState,
      stale: run.stale,
    };
  });

  return (
    <SettingsShell active="calibration" testId="calibration-page">
      <A
        href="/settings"
        class="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-fero-green-dark"
      >
        <ArrowLeft size={14} />
        {tr('nav.settings')}
      </A>
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
        <LoadingPanel
          label={tr('calibration.loading')}
          indeterminate
          detail={tr('calibration.subtitle')}
        />
      </Show>

      <Show when={!loadingCache()}>
        <MethodEvidencePanel
          evidence={methodEvidence()}
          error={methodError()}
          onApply={
            methodEvidence()?.recommendation.available
              ? () => setConfirmApplyMethodOpen(true)
              : undefined
          }
          applying={applyingMethod()}
          appliedMessage={appliedMethod()}
          applyError={applyMethodError()}
        />

        <Show when={sensitivity() || objective()}>
          <CalibrationAdvicePanel
            sensitivity={sensitivity()}
            objective={objective()}
            onApply={recommendedProfile() ? () => setConfirmApplyOpen(true) : undefined}
            applying={applying()}
            appliedMessage={applied()}
            applyError={applyError()}
          />
        </Show>

        <Show when={sensitivity()}>
          <AcoValidationPanel
            validation={shownValidation()}
            profile={recommendedProfile()}
            running={validating()}
            disabled={state() === 'ejecutando'}
            onValidate={() => void validate()}
          />
        </Show>

        <div class="flex flex-wrap gap-1 border-b border-border dark:border-dark-border">
          <button
            type="button"
            data-testid="calibration-result-tab-sensitivity"
            aria-current={tab() === 'sensitivity' ? 'page' : undefined}
            onClick={() => selectTab('sensitivity')}
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
            onClick={() => selectTab('objective')}
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
            fallback={
              <CalibrationObjectiveResults payload={shownPayload() as ObjectiveSweepPayload} />
            }
          >
            <CalibrationResults payload={shownPayload() as AcoSensitivityPayload} />
          </Show>
        </Show>

        <CalibrationHistoryPanel
          history={history()}
          viewing={historyRun() ?? validationRun()}
          onView={(runId) => void viewHistoryRun(runId)}
          onBack={() => {
            setHistoryRun(null);
            setValidationRun(null);
          }}
        />
      </Show>

      <ConfirmDialog
        open={confirmApplyOpen()}
        title={tr('calibration.advice.apply')}
        message={tr('calibration.advice.combination')}
        detail={tr('calibration.advice.scope')}
        confirmLabel={tr('calibration.advice.apply')}
        loading={applying()}
        onConfirm={() => {
          setConfirmApplyOpen(false);
          void applyRecommended();
        }}
        onCancel={() => setConfirmApplyOpen(false)}
        testId="calibration-apply-confirm"
      />

      <ConfirmDialog
        open={confirmApplyMethodOpen()}
        title={tr('calibration.method.apply')}
        message={tr('calibration.method.scope')}
        detail={tr('calibration.method.subtitle')}
        confirmLabel={tr('calibration.method.apply')}
        loading={applyingMethod()}
        onConfirm={() => {
          setConfirmApplyMethodOpen(false);
          void applyMethodRecommended();
        }}
        onCancel={() => setConfirmApplyMethodOpen(false)}
        testId="calibration-apply-method-confirm"
      />
    </SettingsShell>
  );
}
