import { For, Show, createMemo } from 'solid-js';
import { Microscope } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import { useLocale } from '../../core/i18n/solid';
import {
  CALIBRATION_METHOD_PHASES,
  type CalibrationMethodEvidence,
  type CalibrationMethodPhase,
  type CalibrationMethodRecommendation,
} from '../../core/api/benchmark';
import { outcomeLabelKey, outcomeVariant } from './acoValidationUx';

interface MethodEvidencePanelProps {
  evidence: CalibrationMethodEvidence | null;
  /** Motivo por el que no hay evidencia (p. ej. `409` sin factorial de referencia). */
  error: string | null;
  /** Aplica el perfil recomendado al motor; ausente = no hay nada que aplicar. */
  onApply?: () => void;
  applying?: boolean;
  appliedMessage?: string | null;
  applyError?: string | null;
}

interface KnobRow {
  key: string;
  symbol: string;
  labelKey: string;
  standard: string;
  recommended: string;
  alternative?: string;
  moved: boolean;
  effectKm: number | null;
  reason: string | null;
}

type KnobKey = 'acoAlpha' | 'acoBeta' | 'acoRho' | 'acoPatience' | 'pheromoneQ';

const KNOB_SPECS: { key: KnobKey; symbol: string; labelKey: string }[] = [
  { key: 'acoAlpha', symbol: 'α', labelKey: 'calibration.method.knob.alpha' },
  { key: 'acoBeta', symbol: 'β', labelKey: 'calibration.method.knob.beta' },
  { key: 'acoRho', symbol: 'ρ', labelKey: 'calibration.method.knob.rho' },
  { key: 'acoPatience', symbol: 'P', labelKey: 'calibration.method.knob.patience' },
  { key: 'pheromoneQ', symbol: 'Q', labelKey: 'calibration.method.knob.q' },
];

/** Orden declarado de la meseta del RSM (coincide con el Box-Behnken del backend). */
const PLATEAU_KEYS = ['acoBeta', 'acoRho', 'acoIterations'] as const;

function formatValue(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return String(Number(value.toFixed(4)));
}

function formatSigned(value: number | null | undefined): string {
  if (value === undefined || value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} km`;
}

function formatPValue(value: number | null | undefined): string {
  if (value === undefined || value === null) return '—';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(4);
}

function budgetLabel(budget: { acoAnts: number; acoIterations: number } | undefined): string {
  if (!budget) return '—';
  return `${budget.acoAnts}×${budget.acoIterations}`;
}

function formatStamp(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-VE');
}

/** Filas de la tabla «perfil por perilla» (estándar · recomendado · ¿se mueve? · efecto). */
function knobRows(recommendation: CalibrationMethodRecommendation, tr: (key: string) => string): KnobRow[] {
  const rows: KnobRow[] = KNOB_SPECS.map((spec) => {
    const entry = recommendation.justification[spec.key];
    return {
      key: spec.key,
      symbol: spec.symbol,
      labelKey: spec.labelKey,
      standard: formatValue(recommendation.standard[spec.key]),
      recommended: formatValue(recommendation.profile[spec.key]),
      moved: entry?.moved === true,
      effectKm: entry?.effectKm ?? null,
      reason: entry?.reason ?? null,
    };
  });

  const budget = recommendation.justification.budget;
  rows.push({
    key: 'budget',
    symbol: tr('calibration.method.knob.budget'),
    labelKey: 'calibration.method.knob.budget',
    standard: budgetLabel(budget?.value ?? {
      acoAnts: recommendation.standard.acoAnts,
      acoIterations: recommendation.standard.acoIterations,
    }),
    recommended: budgetLabel(budget?.value ?? {
      acoAnts: recommendation.profile.acoAnts,
      acoIterations: recommendation.profile.acoIterations,
    }),
    alternative: budget?.alternative ? budgetLabel(budget.alternative) : undefined,
    moved: budget?.moved === true,
    effectKm: null,
    reason: budget?.reason ?? null,
  });
  return rows;
}

/**
 * Evidencia del protocolo metodológico (C0–C8) leída de la BD, sin ejecutar nada.
 *
 * Muestra el perfil recomendado por perilla con su justificación medida, el veredicto de la
 * validación, los criterios de aceptación de los pesos del objetivo (AC-1/AC-2 sobre la mediana),
 * la meseta del RSM, la trazabilidad de cada fase y los límites declarados.
 */
export function MethodEvidencePanel(props: MethodEvidencePanelProps) {
  const tr = useLocale();
  const rows = createMemo(() =>
    props.evidence ? knobRows(props.evidence.recommendation, tr) : [],
  );
  const plateau = createMemo(() => {
    const table = props.evidence?.analyses.rsm?.plateau;
    if (!table) return [];
    return PLATEAU_KEYS.filter((key) => key in table).map((key) => ({ key, entry: table[key] }));
  });

  return (
    <Card data-testid="calibration-method">
      <CardHeader
        title={tr('calibration.method.title')}
        subtitle={tr('calibration.method.subtitle')}
        action={<Microscope size={18} class="text-fero-blue" />}
      />

      <Show when={props.error}>
        <p class="text-sm text-text-muted" data-testid="calibration-method-error">
          {props.error}
        </p>
      </Show>

      <Show when={(props.evidence?.stalePhases?.length ?? 0) > 0}>
        <p
          class="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          data-testid="calibration-method-stale"
        >
          {tr('calibration.method.stale')}{' '}
          <span class="font-mono">
            {props
              .evidence!.stalePhases!.map((phase) => tr(`calibration.method.phase.${phase}`))
              .join(' · ')}
          </span>
        </p>
      </Show>

      <Show when={!props.error}>
        <Show
          when={props.evidence}
          fallback={
            <p class="text-sm text-text-muted" data-testid="calibration-method-empty">
              {tr('calibration.method.noEvidence')}
            </p>
          }
        >
          {(evidence) => (
            <div class="space-y-5">
              <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3" data-testid="calibration-method-protocol">
                <div>
                  <p class="text-xs text-text-muted">{tr('calibration.method.protocol.delta')}</p>
                  <p class="font-mono text-text-primary">
                    {formatValue(evidence().protocol.deltaKm)} km
                  </p>
                </div>
                <div>
                  <p class="text-xs text-text-muted">{tr('calibration.method.protocol.seeds')}</p>
                  <p class="font-mono text-text-primary">{evidence().protocol.seeds}</p>
                </div>
                <div>
                  <p class="text-xs text-text-muted">
                    {tr('calibration.method.protocol.standardProfile')}
                  </p>
                  <p class="font-mono text-text-primary">{evidence().protocol.standardProfile}</p>
                </div>
                <div>
                  <p class="text-xs text-text-muted">
                    {tr('calibration.method.protocol.standardHyperparameters')}
                  </p>
                  <p class="font-mono text-text-primary">
                    {evidence().protocol.standardHyperparameters}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-text-muted">{tr('calibration.method.protocol.reference')}</p>
                  <p class="font-mono text-text-primary">
                    {evidence().protocol.referenceRunId ?? '—'}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-text-muted">{tr('calibration.method.ratioGoverns')}</p>
                  <p class="font-mono text-text-primary">
                    {evidence().recommendation.ratioGoverns === true
                      ? tr('calibration.method.ratioGoverns.yes')
                      : evidence().recommendation.ratioGoverns === false
                        ? tr('calibration.method.ratioGoverns.no')
                        : '—'}
                  </p>
                </div>
              </div>

              <div data-testid="calibration-method-profile">
                <h4 class="text-sm font-semibold text-text-primary">
                  {tr('calibration.method.profile.title')}
                </h4>
                <div class="mt-2 overflow-x-auto">
                  <table
                    class="w-full min-w-[720px] text-left text-xs"
                    data-testid="calibration-method-profile-table"
                  >
                    <thead>
                      <tr class="border-b border-border text-text-muted dark:border-dark-border">
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.col.knob')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.col.standard')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.col.recommended')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.col.moves')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.col.effect')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.col.reason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={rows()}>
                        {(row) => (
                          <tr
                            class="border-b border-border/60 align-top dark:border-dark-border/60"
                            data-testid={`calibration-method-knob-${row.key}`}
                          >
                            <td class="px-2 py-2 whitespace-nowrap">
                              <span class="font-mono text-sm font-semibold text-text-primary">
                                {row.symbol}
                              </span>
                              <span class="ml-1 text-text-muted">{tr(row.labelKey)}</span>
                            </td>
                            <td class="px-2 py-2 font-mono text-text-muted">{row.standard}</td>
                            <td class="px-2 py-2 font-mono font-semibold text-text-primary">
                              {row.recommended}
                              <Show when={row.alternative}>
                                <span class="ml-1 font-normal text-text-muted">
                                  {`(${row.alternative})`}
                                </span>
                              </Show>
                            </td>
                            <td class="px-2 py-2">
                              <Show
                                when={row.moved}
                                fallback={<span class="text-text-muted">{tr('calibration.method.no')}</span>}
                              >
                                <Badge variant="warning">{tr('calibration.method.yes')}</Badge>
                              </Show>
                            </td>
                            <td class="px-2 py-2 font-mono">
                              {row.effectKm === null ? '—' : formatSigned(row.effectKm)}
                            </td>
                            <td class="px-2 py-2 text-text-muted">{row.reason ?? '—'}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>

              <div data-testid="calibration-method-validation">
                <h4 class="text-sm font-semibold text-text-primary">
                  {tr('calibration.method.validation.title')}
                </h4>
                <Show
                  when={evidence().analyses.validation}
                  fallback={
                    <p class="mt-1 text-sm text-text-muted">
                      {tr('calibration.method.validation.none')}
                    </p>
                  }
                >
                  {(validation) => (
                    <div class="mt-2 space-y-2">
                      <div class="flex flex-wrap items-center gap-3">
                        <Show when={validation().verdict}>
                          {(verdict) => (
                            <Badge variant={outcomeVariant(verdict())}>
                              {tr(outcomeLabelKey(verdict()))}
                            </Badge>
                          )}
                        </Show>
                        <span class="text-xs text-text-muted">
                          {validation().verdictReason ?? validation().reason ?? ''}
                        </span>
                      </div>

                      <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        <div>
                          <p class="text-xs text-text-muted">
                            {tr('calibration.method.validation.delta')}
                          </p>
                          <p class="font-mono text-text-primary">
                            {formatSigned(validation().delta?.medianKm)}
                          </p>
                        </div>
                        <div>
                          <p class="text-xs text-text-muted">
                            {tr('calibration.method.validation.ci')}
                          </p>
                          <p class="font-mono text-text-primary">
                            {validation().delta?.ci
                              ? `[${validation().delta?.ci?.[0]}, ${validation().delta?.ci?.[1]}]`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p class="text-xs text-text-muted">
                            {tr('calibration.method.validation.pValue')}
                          </p>
                          <p class="font-mono text-text-primary">
                            {formatPValue(validation().delta?.test?.pValue)}
                          </p>
                        </div>
                        <div>
                          <p class="text-xs text-text-muted">
                            {tr('calibration.method.validation.tost')}
                          </p>
                          <p class="font-mono text-text-primary">
                            {formatPValue(validation().delta?.tost?.pValue)}
                          </p>
                        </div>
                        <div>
                          <p class="text-xs text-text-muted">
                            {tr('calibration.method.validation.controlMedian')}
                          </p>
                          <p class="font-mono text-text-primary">
                            {formatValue(validation().control?.stats?.median)} km
                          </p>
                        </div>
                        <div>
                          <p class="text-xs text-text-muted">
                            {tr('calibration.method.validation.recommendedMedian')}
                          </p>
                          <p class="font-mono text-text-primary">
                            {formatValue(validation().recommended?.stats?.median)} km
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>
              </div>

              <div data-testid="calibration-method-objective">
                <h4 class="text-sm font-semibold text-text-primary">
                  {tr('calibration.method.objective.title')}
                </h4>
                <Show
                  when={evidence().analyses.objective}
                  fallback={
                    <p class="mt-1 text-sm text-text-muted">
                      {tr('calibration.method.objective.none')}
                    </p>
                  }
                >
                  {(objective) => (
                    <div class="mt-2 space-y-2">
                      <div class="flex flex-wrap items-center gap-3">
                        <Badge variant={objective().ac1?.ok ? 'success' : 'warning'}>
                          {`${tr('calibration.method.objective.ac1')} · ${tr(
                            objective().ac1?.ok ? 'calibration.method.yes' : 'calibration.method.no',
                          )}`}
                        </Badge>
                        <Badge variant={objective().ac2?.ok ? 'success' : 'warning'}>
                          {`${tr('calibration.method.objective.ac2')} · ${tr(
                            objective().ac2?.ok ? 'calibration.method.yes' : 'calibration.method.no',
                          )}`}
                        </Badge>
                      </div>
                      <p class="text-xs text-text-muted">{objective().ac2Reason ?? ''}</p>
                    </div>
                  )}
                </Show>
              </div>

              <div data-testid="calibration-method-rsm">
                <h4 class="text-sm font-semibold text-text-primary">
                  {tr('calibration.method.rsm.title')}
                </h4>
                <Show
                  when={plateau().length}
                  fallback={
                    <p class="mt-1 text-sm text-text-muted">{tr('calibration.method.rsm.none')}</p>
                  }
                >
                  <div class="mt-2 overflow-x-auto">
                    <table
                      class="w-full min-w-[560px] text-left text-xs"
                      data-testid="calibration-method-rsm-table"
                    >
                      <thead>
                        <tr class="border-b border-border text-text-muted dark:border-dark-border">
                          <th class="px-2 py-2 font-semibold">
                            {tr('calibration.method.rsm.col.factor')}
                          </th>
                          <th class="px-2 py-2 font-semibold">
                            {tr('calibration.method.rsm.col.range')}
                          </th>
                          <th class="px-2 py-2 font-semibold">
                            {tr('calibration.method.rsm.col.best')}
                          </th>
                          <th class="px-2 py-2 font-semibold">
                            {tr('calibration.method.rsm.col.curvature')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={plateau()}>
                          {(item) => (
                            <tr class="border-b border-border/60 dark:border-dark-border/60">
                              <td class="px-2 py-2 font-mono font-semibold text-text-primary">
                                {item.entry.symbol}
                              </td>
                              <td class="px-2 py-2 font-mono text-text-muted">
                                {`[${formatValue(item.entry.naturalRange[0])}, ${formatValue(
                                  item.entry.naturalRange[1],
                                )}]`}
                              </td>
                              <td class="px-2 py-2 font-mono">{formatValue(item.entry.bestNatural)}</td>
                              <td class="px-2 py-2 font-mono">{formatValue(item.entry.curvature)}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                  <Show when={evidence().analyses.rsm?.warnings?.length}>
                    <ul class="mt-2 space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                      <For each={evidence().analyses.rsm?.warnings ?? []}>
                        {(warning) => <li>{`· ${warning}`}</li>}
                      </For>
                    </ul>
                  </Show>
                </Show>
              </div>

              <div data-testid="calibration-method-trace">
                <h4 class="text-sm font-semibold text-text-primary">
                  {tr('calibration.method.trace.title')}
                </h4>
                <div class="mt-2 overflow-x-auto">
                  <table
                    class="w-full min-w-[560px] text-left text-xs"
                    data-testid="calibration-method-trace-table"
                  >
                    <thead>
                      <tr class="border-b border-border text-text-muted dark:border-dark-border">
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.trace.col.phase')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.trace.col.run')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.trace.col.seeds')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.trace.col.stamp')}</th>
                        <th class="px-2 py-2 font-semibold">{tr('calibration.method.trace.col.when')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={CALIBRATION_METHOD_PHASES}>
                        {(phase: CalibrationMethodPhase) => (
                          <tr
                            class="border-b border-border/60 dark:border-dark-border/60"
                            data-testid={`calibration-method-trace-${phase}`}
                          >
                            <td class="px-2 py-2 font-medium text-text-primary">
                              {tr(`calibration.method.phase.${phase}`)}
                            </td>
                            <td class="px-2 py-2 font-mono text-text-muted">
                              {evidence().phases[phase].runId ?? '—'}
                            </td>
                            <td class="px-2 py-2 font-mono text-text-muted">
                              {evidence().phases[phase].seeds}
                            </td>
                            <td class="px-2 py-2 text-text-muted">
                              {tr(
                                `calibration.cacheState.${
                                  evidence().phases[phase].cacheState ?? 'unknown'
                                }`,
                              )}
                            </td>
                            <td class="px-2 py-2 text-text-muted">
                              {formatStamp(evidence().phases[phase].generatedAt)}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>

              <Show when={evidence().recommendation.warnings.length}>
                <div data-testid="calibration-method-warnings">
                  <h4 class="text-sm font-semibold text-text-primary">
                    {tr('calibration.method.warnings')}
                  </h4>
                  <ul class="mt-1 space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                    <For each={evidence().recommendation.warnings}>
                      {(warning) => <li>{`· ${warning}`}</li>}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={evidence().recommendation.limitations.length}>
                <div data-testid="calibration-method-limitations">
                  <h4 class="text-sm font-semibold text-text-primary">
                    {tr('calibration.method.limitations')}
                  </h4>
                  <ul class="mt-1 space-y-0.5 text-xs text-text-muted">
                    <For each={evidence().recommendation.limitations}>
                      {(item) => <li>{`· ${item}`}</li>}
                    </For>
                  </ul>
                </div>
              </Show>

              <Show when={props.applyError}>
                <p class="text-xs text-red-600" data-testid="calibration-method-apply-feedback">
                  {props.applyError}
                </p>
              </Show>
              <Show when={!props.applyError && props.appliedMessage}>
                <p class="text-xs text-fero-green-dark" data-testid="calibration-method-apply-feedback">
                  {props.appliedMessage}
                </p>
              </Show>

              <div class="border-t border-border pt-3 dark:border-dark-border">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-xs text-text-muted">{tr('calibration.method.scope')}</p>
                  <Button
                    variant="primary"
                    size="sm"
                    data-testid="calibration-method-apply"
                    disabled={!props.onApply || props.applying}
                    loading={props.applying}
                    onClick={() => props.onApply?.()}
                  >
                    {tr('calibration.method.apply')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </Card>
  );
}
