import { For, Show } from 'solid-js';
import type {
  BaselineEvidence,
  CaseStudyEvidence,
  StatisticalEvidence,
} from '../../core/api/thesisEvidence';

/**
 * Tablas de la evidencia de evaluación (tesis): reproducen —con los datos vivos— las
 * tablas del capítulo de resultados (comparativa, Wilcoxon y casos de estudio).
 */

function number(value: number | null | undefined, digits = 1): string {
  return value == null ? '—' : value.toFixed(digits);
}

function percent(value: number | null | undefined, digits = 1): string {
  return value == null ? '—' : `${value.toFixed(digits)} %`;
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** p-valor legible: decimal cuando es grande, notación científica cuando es diminuto. */
export function formatPValue(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value <= 0) return '0';
  if (value >= 0.001) return value.toFixed(4);
  const exponent = Math.floor(Math.log10(value));
  const mantissa = value / 10 ** exponent;
  const script = String(exponent)
    .split('')
    .map((char) => SUPERSCRIPT[char] ?? char)
    .join('');
  return `${mantissa.toFixed(2)} × 10${script}`;
}

const headClass =
  'border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted dark:border-dark-border';
const cellClass = 'px-3 py-2 text-text-secondary';

interface PanelProps {
  evidence: BaselineEvidence;
}

/** Comparativa base vs optimizado por escenario (tabla §3 del capítulo). */
export function BaselineEvidenceTable(props: PanelProps) {
  return (
    <div class="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
      <table class="w-full text-sm" data-testid="thesis-baseline-table">
        <thead>
          <tr class="text-left">
            <th class={headClass}>Escenario</th>
            <th class={`${headClass} text-right`}>Dist. base</th>
            <th class={`${headClass} text-right`}>Dist. opt.</th>
            <th class={`${headClass} text-right`}>Ahorro</th>
            <th class={`${headClass} text-right`}>Dur. base</th>
            <th class={`${headClass} text-right`}>Dur. opt.</th>
            <th class={`${headClass} text-right`}>Fuel base</th>
            <th class={`${headClass} text-right`}>Fuel opt.</th>
            <th class={`${headClass} text-right`}>CO₂ evitado</th>
            <th class={`${headClass} text-right`}>Cobertura</th>
            <th class={`${headClass} text-right`}>No cubiertos</th>
            <th class={`${headClass} text-right`}>Viajes</th>
            <th class={`${headClass} text-right`}>Cómputo</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border dark:divide-dark-border">
          <For each={props.evidence.runs}>
            {(run) => (
              <tr>
                <td class="px-3 py-2 font-medium text-text-primary dark:text-white">{run.scenarioId}</td>
                <td class={`${cellClass} text-right`}>{number(run.distanceKm?.current)}</td>
                <td class={`${cellClass} text-right`}>{number(run.distanceKm?.optimized)}</td>
                <td class="px-3 py-2 text-right font-semibold text-fero-green-dark">
                  {percent(run.savingPct)}
                </td>
                <td class={`${cellClass} text-right`}>{number(run.durationHours?.current, 2)}</td>
                <td class={`${cellClass} text-right`}>{number(run.durationHours?.optimized, 2)}</td>
                <td class={`${cellClass} text-right`}>{number(run.fuelLiters?.current)}</td>
                <td class={`${cellClass} text-right`}>{number(run.fuelLiters?.optimized)}</td>
                <td class={`${cellClass} text-right`}>{number(run.co2KgAvoided)}</td>
                <td class={`${cellClass} text-right`}>{number(run.coveragePct?.optimized, 0)} %</td>
                <td class={`${cellClass} text-right`}>{run.uncoveredPoints}</td>
                <td class={`${cellClass} text-right`}>{run.landfillTrips}</td>
                <td class={`${cellClass} text-right`}>{number(run.computationSeconds)} s</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

interface StatisticalProps {
  evidence: StatisticalEvidence;
}

/** Wilcoxon pareada por escenario (tabla §4 del capítulo). */
export function StatisticalEvidenceTable(props: StatisticalProps) {
  return (
    <div class="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
      <table class="w-full text-sm" data-testid="thesis-statistical-table">
        <thead>
          <tr class="text-left">
            <th class={headClass}>Escenario</th>
            <th class={`${headClass} text-right`}>N</th>
            <th class={`${headClass} text-right`}>Media base</th>
            <th class={`${headClass} text-right`}>Media opt.</th>
            <th class={`${headClass} text-right`}>Ahorro medio</th>
            <th class={`${headClass} text-right`}>σ opt.</th>
            <th class={`${headClass} text-right`}>W</th>
            <th class={`${headClass} text-right`}>p</th>
            <th class={`${headClass} text-right`}>p (Holm)</th>
            <th class={`${headClass} text-right`}>IC 95 % dif.</th>
            <th class={`${headClass} text-right`}>¿Significativo?</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border dark:divide-dark-border">
          <For each={props.evidence.validations}>
            {(row) => (
              <tr>
                <td class="px-3 py-2 font-medium text-text-primary dark:text-white">{row.scenarioId}</td>
                <td class={`${cellClass} text-right`}>{row.nRuns}</td>
                <td class={`${cellClass} text-right`}>{number(row.meanDistanceCurrent)}</td>
                <td class={`${cellClass} text-right`}>{number(row.meanDistanceOptimized)}</td>
                <td class="px-3 py-2 text-right font-semibold text-fero-green-dark">
                  {percent(row.savingPct)}
                </td>
                <td class={`${cellClass} text-right`}>{number(row.stdDistanceOptimized, 2)}</td>
                <td class={`${cellClass} text-right`}>{number(row.wilcoxon?.statistic, 1)}</td>
                <td class={`${cellClass} text-right font-mono text-xs`}>{formatPValue(row.wilcoxon?.pValue)}</td>
                <td class={`${cellClass} text-right font-mono text-xs`}>{formatPValue(row.pValueHolm)}</td>
                <td class={`${cellClass} text-right`}>
                  <Show when={row.confidenceInterval?.lower != null} fallback="—">
                    [{number(row.confidenceInterval.lower)} ; {number(row.confidenceInterval.upper)}]
                  </Show>
                </td>
                <td class={`${cellClass} text-right`}>
                  {row.isSignificantHolm ? 'Sí' : 'No'}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p class="border-t border-border px-3 py-2 text-xs text-text-muted dark:border-dark-border">
        Tamaño del efecto (rango-biserial r y d de Cohen pareada d<sub>z</sub>):
        <For each={props.evidence.validations}>
          {(row) => (
            <span>
              {' '}
              {row.scenarioId} r={number(row.effectSize?.rankBiserial, 2)} · d<sub>z</sub>=
              {number(row.effectSize?.cohenDz, 2)}.
            </span>
          )}
        </For>
      </p>
    </div>
  );
}

interface CaseStudyProps {
  evidence: CaseStudyEvidence;
}

/** Tabla comparativa de los casos de estudio (Fase 12.7 §2). */
export function CaseStudyEvidenceTable(props: CaseStudyProps) {
  return (
    <div class="space-y-3">
      <div class="overflow-x-auto rounded-lg border border-border dark:border-dark-border">
        <table class="w-full text-sm" data-testid="thesis-case-study-table">
          <thead>
            <tr class="text-left">
              <th class={headClass}>Caso</th>
              <th class={headClass}>Escenario</th>
              <th class={`${headClass} text-right`}>Puntos</th>
              <th class={`${headClass} text-right`}>Cubiertos</th>
              <th class={`${headClass} text-right`}>Pend.</th>
              <th class={`${headClass} text-right`}>Dist. ACO (km)</th>
              <th class={`${headClass} text-right`}>Duración (h)</th>
              <th class={`${headClass} text-right`}>Rutas</th>
              <th class={`${headClass} text-right`}>Simulación</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={props.evidence.cases}>
              {(row) => (
                <tr>
                  <td class="px-3 py-2 font-medium text-text-primary dark:text-white">
                    {row.code}
                    <Show when={props.evidence.usage?.[row.code]}>
                      <span class="block text-xs font-normal text-text-muted">
                        {props.evidence.usage[row.code]}
                      </span>
                    </Show>
                  </td>
                  <td class={cellClass}>{row.scenarioId}</td>
                  <td class={`${cellClass} text-right`}>{row.pointCount}</td>
                  <td class={`${cellClass} text-right`}>{row.servedPoints}</td>
                  <td class={`${cellClass} text-right`}>{row.uncoveredPoints}</td>
                  <td class={`${cellClass} text-right`}>{number(row.distanceKm)}</td>
                  <td class={`${cellClass} text-right`}>{number(row.durationH, 2)}</td>
                  <td class={`${cellClass} text-right`}>{row.routeCount}</td>
                  <td class={`${cellClass} text-right`}>#{row.simulationId}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={props.evidence.sharedPoint}>
        {(shared) => (
          <p class="rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-text-secondary dark:border-dark-border">
            Contenedor compartido <span class="font-semibold">{shared().code}</span> (M:N entre
            CE-UNARE-NORTE y CE-UNARE-SUR): demanda {number(shared().demandKg, 0)} kg · ruta{' '}
            {shared().route ?? '—'} · parada {shared().sequence ?? '—'}.
          </p>
        )}
      </Show>
    </div>
  );
}
