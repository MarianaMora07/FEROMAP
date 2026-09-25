import { Match, Show, Switch, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { AlertTriangle, Play, RefreshCw } from 'lucide-solid';
import { Button, Card, LoadingPanel, TabList, tabButtonId } from '../../design-system/components';
import {
  THESIS_SCENARIOS,
  THESIS_STATISTICAL_N_RUNS,
  THESIS_STATISTICAL_QUICK_N_RUNS,
  fetchThesisEvidenceJob,
  loadThesisEvidence,
  startThesisEvidenceJob,
  type BaselineEvidence,
  type CaseStudyEvidence,
  type StatisticalEvidence,
  type ThesisEvidenceKind,
  type ThesisEvidencePayload,
} from '../../core/api/thesisEvidence';
import {
  BaselineEvidenceTable,
  CaseStudyEvidenceTable,
  StatisticalEvidenceTable,
} from './ThesisEvidenceTables';

/**
 * Evidencia de la evaluación (tesis) desde la vista de calibración.
 *
 * Tres pestañas que reproducen las tablas del capítulo de resultados: comparativa base vs
 * optimizado (5 escenarios), validación estadística (Wilcoxon) y casos de estudio. Lee la
 * caché JSON que comparten las recetas `just` (0 CPU) y permite regenerarla como job con
 * progreso.
 */

const POLL_MS = 2000;

/**
 * Pestañas **visibles**. Casos de estudio está **oculta** por decisión de defensa (D8: el caso
 * combinatorio es solo anexo, no va en la demo en vivo). El runner, el endpoint
 * (`/benchmarks/thesis/case_study`) y `CaseStudyEvidenceTable` siguen disponibles: para volver
 * a mostrarla, añade `'case_study'` a esta lista.
 */
const VISIBLE_KINDS: readonly ThesisEvidenceKind[] = ['baseline', 'statistical'];

const KIND_META: Record<ThesisEvidenceKind, { label: string; help: string; cost: string }> = {
  baseline: {
    label: 'Comparativa',
    help: 'Base vs optimizado en los 5 escenarios del contrato, con el perfil ACO estándar.',
    cost: '5 escenarios × (calentamiento descartado + medida) · pocos minutos.',
  },
  statistical: {
    label: 'Validación estadística',
    help: 'Wilcoxon pareada base vs optimizado por escenario, con la familia ajustada por Holm.',
    cost: 'N corridas pareadas por escenario (30 es la cifra del capítulo) · ~15 min con la familia completa.',
  },
  case_study: {
    label: 'Casos de estudio',
    help: 'Los 4 casos demo: aislamiento M:N, multi-viaje al vertedero y stress test.',
    cost: '4 casos, uno de ellos medido como simulación semanal · varios minutos.',
  },
};

interface RunningJob {
  kind: ThesisEvidenceKind;
  status: string;
  phase: string | null;
  progress: number;
}

function formatGeneratedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ThesisEvidenceSection() {
  const [tab, setTab] = createSignal<ThesisEvidenceKind>('baseline');
  const [payloads, setPayloads] = createSignal<Record<string, ThesisEvidencePayload | null>>({});
  const [loadingKind, setLoadingKind] = createSignal<ThesisEvidenceKind | null>(null);
  const [job, setJob] = createSignal<RunningJob | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [nRuns, setNRuns] = createSignal(THESIS_STATISTICAL_N_RUNS);
  const [scenarioScope, setScenarioScope] = createSignal<'normal' | 'all'>('normal');

  const payload = (kind: ThesisEvidenceKind) => payloads()[kind] ?? null;
  const isRunning = (kind: ThesisEvidenceKind) => {
    const current = job();
    return current?.kind === kind && (current.status === 'pending' || current.status === 'running');
  };
  const anyRunning = () => {
    const current = job();
    return current != null && (current.status === 'pending' || current.status === 'running');
  };

  onCleanup(() => setJob(null));

  const load = async (kind: ThesisEvidenceKind) => {
    setLoadingKind(kind);
    try {
      const stored = await loadThesisEvidence(kind);
      setPayloads((current) => ({ ...current, [kind]: stored }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la evidencia');
    } finally {
      setLoadingKind((current) => (current === kind ? null : current));
    }
  };

  onMount(() => void load('baseline'));

  // Lectura perezosa: la primera vez que se abre una pestaña se trae su caché.
  createEffect(() => {
    const kind = tab();
    if (payloads()[kind] === undefined && loadingKind() !== kind) void load(kind);
  });

  const run = async () => {
    const kind = tab();
    setError(null);
    setNotice(null);
    setJob({ kind, status: 'pending', phase: 'Iniciando…', progress: 0 });
    try {
      const request =
        kind === 'statistical'
          ? {
              nRuns: nRuns(),
              scenarioIds:
                scenarioScope() === 'all' ? [...THESIS_SCENARIOS] : ['normal'],
            }
          : {};
      const { jobId } = await startThesisEvidenceJob(kind, request);
      for (;;) {
        const snapshot = await fetchThesisEvidenceJob(jobId);
        setJob({
          kind,
          status: snapshot.status,
          phase: snapshot.phase,
          progress: snapshot.progress,
        });
        if (snapshot.status === 'completed') {
          if (snapshot.result) {
            const result = snapshot.result;
            setPayloads((current) => ({ ...current, [kind]: result }));
          } else {
            await load(kind);
          }
          setNotice('Evidencia generada.');
          break;
        }
        if (snapshot.status === 'failed') {
          throw new Error(snapshot.error ?? 'La ejecución de la evidencia falló');
        }
        if (snapshot.status === 'cancelled') {
          throw new Error('Ejecución cancelada');
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la evidencia');
    } finally {
      setJob(null);
    }
  };

  return (
    <Card data-testid="thesis-evidence-section">
      <TabList
        idPrefix="thesis-evidence"
        panelId="thesis-evidence-panel"
        ariaLabel="Evidencia de la evaluación"
        testId="thesis-evidence-tabs"
        testIdFor={(id) => `thesis-evidence-tab-${id}`}
        containerClass="flex flex-wrap gap-1 border-b border-border dark:border-dark-border"
        tabClass={(active) =>
          `shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active
              ? 'border-fero-green-mid text-fero-green-dark'
              : 'border-transparent text-text-muted hover:text-text-secondary'
          }`
        }
        tabs={VISIBLE_KINDS.map((kind) => ({
          id: kind,
          label: KIND_META[kind].label,
        }))}
        active={tab()}
        onChange={(id) => setTab(id as ThesisEvidenceKind)}
      />

      <div
        id="thesis-evidence-panel"
        role="tabpanel"
        aria-labelledby={tabButtonId('thesis-evidence', tab())}
        class="space-y-4"
      >
        <div>
          <p class="text-sm text-text-secondary">{KIND_META[tab()].help}</p>
          <p class="mt-0.5 text-xs text-text-muted">{KIND_META[tab()].cost}</p>
        </div>

        <Show when={tab() === 'statistical'}>
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-1 text-xs font-medium text-text-muted">
              Corridas pareadas
              <select
                class="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary dark:border-dark-border"
                value={String(nRuns())}
                disabled={anyRunning()}
                data-testid="thesis-statistical-nruns"
                onChange={(event) => setNRuns(Number(event.currentTarget.value))}
              >
                <option value={String(THESIS_STATISTICAL_QUICK_N_RUNS)}>
                  {THESIS_STATISTICAL_QUICK_N_RUNS} (iteración rápida)
                </option>
                <option value={String(THESIS_STATISTICAL_N_RUNS)}>
                  {THESIS_STATISTICAL_N_RUNS} (cifra del capítulo)
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs font-medium text-text-muted">
              Familia del contraste
              <select
                class="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary dark:border-dark-border"
                value={scenarioScope()}
                disabled={anyRunning()}
                data-testid="thesis-statistical-scope"
                onChange={(event) =>
                  setScenarioScope(event.currentTarget.value === 'all' ? 'all' : 'normal')
                }
              >
                <option value="normal">Solo `normal` (tabla del capítulo)</option>
                <option value="all">Los 5 escenarios (familia + Holm)</option>
              </select>
            </label>
          </div>
        </Show>

        <div class="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            class="gap-2"
            icon={<Play size={14} />}
            loading={isRunning(tab())}
            disabled={anyRunning() && !isRunning(tab())}
            onClick={() => void run()}
            data-testid="thesis-evidence-run"
          >
            {payload(tab()) ? 'Volver a ejecutar' : 'Ejecutar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="gap-2"
            icon={<RefreshCw size={14} />}
            disabled={anyRunning() || loadingKind() === tab()}
            onClick={() => void load(tab())}
            data-testid="thesis-evidence-refresh"
          >
            Releer caché
          </Button>
        </div>

        <Show when={isRunning(tab())}>
          <div class="space-y-1" data-testid="thesis-evidence-progress">
            <div class="flex items-center justify-between text-xs text-text-muted">
              <span>{job()?.phase ?? 'En curso…'}</span>
              <span>{Math.round(job()?.progress ?? 0)} %</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-elevated">
              <div
                class="h-full rounded-full bg-fero-green-dark transition-all"
                style={{ width: `${Math.max(4, Math.round(job()?.progress ?? 0))} %` }}
              />
            </div>
          </div>
        </Show>

        <Show when={error()}>
          <p
            role="alert"
            class="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/5 dark:text-red-300"
            data-testid="thesis-evidence-error"
          >
            <AlertTriangle size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
            {error()}
          </p>
        </Show>

        <Show when={notice()}>
          <p class="text-sm text-fero-green-dark" role="status" data-testid="thesis-evidence-notice">
            {notice()}
          </p>
        </Show>

        <Show when={loadingKind() === tab() && !payload(tab())}>
          <LoadingPanel label="Leyendo evidencia guardada…" indeterminate />
        </Show>

        <Show
          when={payload(tab())}
          fallback={
            <div
              class="rounded-xl border border-dashed border-border bg-surface/40 px-4 py-8 text-center dark:border-dark-border"
              data-testid="thesis-evidence-empty"
            >
              <p class="text-sm font-semibold text-text-primary">Sin evidencia generada</p>
              <p class="mx-auto mt-1 max-w-md text-sm text-text-muted">
                Pulsa <span class="font-semibold">Ejecutar</span> para generarla. También puedes
                producirla desde la consola con la receta <code>just</code> equivalente.
              </p>
            </div>
          }
        >
          <Switch>
            <Match when={tab() === 'baseline'}>
              <BaselineEvidenceTable evidence={payload('baseline') as BaselineEvidence} />
            </Match>
            <Match when={tab() === 'statistical'}>
              <StatisticalEvidenceTable evidence={payload('statistical') as StatisticalEvidence} />
            </Match>
            <Match when={tab() === 'case_study'}>
              <CaseStudyEvidenceTable evidence={payload('case_study') as CaseStudyEvidence} />
            </Match>
          </Switch>
          <p class="text-xs text-text-muted">
            Generado {formatGeneratedAt(payload(tab())?.generatedAt)}. La caché la comparten la
            vista y las recetas <code>just</code>.
          </p>
        </Show>
      </div>
    </Card>
  );
}
