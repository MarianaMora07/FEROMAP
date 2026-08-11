import type { KpiMetrics } from '../../data/types/simulation';
import { executiveSummaryFromKpis } from '../../core/utils/simulationWizard';

interface ExecutiveSummaryProps {
  kpis: KpiMetrics;
}

export function ExecutiveSummary(props: ExecutiveSummaryProps) {
  const summary = () => executiveSummaryFromKpis(props.kpis);

  return (
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-xl border border-fero-green/30 bg-fero-green/10 px-4 py-3">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-fero-green-dark">Ahorro</p>
        <p class="mt-1 font-heading text-2xl font-bold text-fero-green-dark">{summary().savingPct}%</p>
        <p class="text-xs text-text-muted">Distancia vs ruta actual</p>
      </div>
      <div class="rounded-xl border border-border bg-surface px-4 py-3 dark:border-dark-border dark:bg-dark-surface">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Distancia</p>
        <p class="mt-1 font-heading text-2xl font-bold text-text-primary dark:text-white">
          {summary().distanceOptimized} km
        </p>
        <p class="text-xs text-text-muted">Antes: {summary().distanceCurrent} km</p>
      </div>
      <div class="rounded-xl border border-border bg-surface px-4 py-3 dark:border-dark-border dark:bg-dark-surface">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Cobertura crítica</p>
        <p class="mt-1 font-heading text-2xl font-bold text-text-primary dark:text-white">
          {summary().criticalCoverage}%
        </p>
        <p class="text-xs text-text-muted">Contenedores ≥ 80% atendidos</p>
      </div>
      <div class="rounded-xl border border-border bg-surface px-4 py-3 dark:border-dark-border dark:bg-dark-surface">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-text-muted">CO₂ evitado</p>
        <p class="mt-1 font-heading text-2xl font-bold text-text-primary dark:text-white">
          {summary().co2Avoided} kg
        </p>
        <p class="text-xs text-text-muted">Estimado por ahorro de combustible</p>
      </div>
    </div>
  );
}
