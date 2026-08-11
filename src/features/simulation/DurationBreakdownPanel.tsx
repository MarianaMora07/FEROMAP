import { Show } from 'solid-js';
import { Clock, Users } from 'lucide-solid';
import type { KpiMetrics } from '../../data/types/simulation';
import { buildDurationBreakdownDisplay } from '../../core/utils/optimizationResults';
import { Card, CardHeader } from '../../design-system/components';

interface DurationBreakdownPanelProps {
  kpis: KpiMetrics;
}

function BreakdownColumn(props: {
  title: string;
  travel: string;
  service: string;
  crewAssignment: string;
  total: string;
  highlight?: boolean;
}) {
  return (
    <div
      class={`rounded-lg border px-3 py-3 ${
        props.highlight
          ? 'border-fero-green/40 bg-fero-green/5 dark:border-fero-green/30'
          : 'border-border bg-surface dark:border-dark-border dark:bg-dark-surface'
      }`}
    >
      <p
        class={`text-[10px] font-semibold uppercase tracking-wide ${
          props.highlight ? 'text-fero-green-dark' : 'text-text-muted'
        }`}
      >
        {props.title}
      </p>
      <dl class="mt-2 space-y-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-text-secondary">Viaje</dt>
          <dd class="font-medium text-text-primary dark:text-white">{props.travel}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="flex items-center gap-1 text-text-secondary">
            <Users size={14} class="shrink-0" />
            Paradas ({props.crewAssignment})
          </dt>
          <dd class="font-medium text-text-primary dark:text-white">{props.service}</dd>
        </div>
        <div class="flex items-center justify-between gap-2 border-t border-border pt-2 dark:border-dark-border">
          <dt class="font-semibold text-text-primary dark:text-white">Total</dt>
          <dd class="font-semibold text-text-primary dark:text-white">{props.total}</dd>
        </div>
      </dl>
    </div>
  );
}

export function DurationBreakdownPanel(props: DurationBreakdownPanelProps) {
  const breakdown = () => buildDurationBreakdownDisplay(props.kpis);

  return (
    <Card>
      <CardHeader
        title="Desglose de duración"
        subtitle="Viaje · Paradas (dotación) · Total — el algoritmo optimiza distancia; la duración incluye tiempo en cada punto según la cuadrilla."
      />
      <div class="mb-3 flex items-start gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2.5 text-xs text-text-secondary dark:border-dark-border dark:bg-dark-surface-hover">
        <Clock size={16} class="mt-0.5 shrink-0 text-fero-blue" />
        <p>
          La <strong class="font-semibold text-text-primary dark:text-white">misma ruta en kilómetros</strong>{' '}
          puede requerir <strong class="font-semibold text-text-primary dark:text-white">más horas</strong> si faltan
          operarios de campo: el conductor siempre está; cada operario faltante suma 30 s por parada.
        </p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <BreakdownColumn title="Ruta actual" {...breakdown().current} />
        <BreakdownColumn title="Ruta optimizada" highlight {...breakdown().optimized} />
      </div>
      <Show when={props.kpis.exceedsWorkday?.optimized}>
        <p class="mt-3 text-xs text-amber-800 dark:text-amber-200">
          La duración optimizada supera la jornada de referencia ({props.kpis.workdayHours ?? 8} h): puede implicar un
          segundo día de trabajo aunque la distancia siga siendo la óptima.
        </p>
      </Show>
    </Card>
  );
}
