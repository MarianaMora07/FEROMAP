import { Show } from 'solid-js';
import { CheckCircle2, MapPin, Route, Wrench } from 'lucide-solid';
import { KpiCard, ProgressBar } from '../../design-system/components';
import {
  formatOperatorDistanceKm,
  type OperatorDaySummary,
} from '../../core/operator/operatorDayClosureUx';

interface OperatorDaySummaryCardProps {
  summary: OperatorDaySummary;
  compact?: boolean;
}

function formatClosedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OperatorDaySummaryCard(props: OperatorDaySummaryCardProps) {
  const closedLabel = () => formatClosedAt(props.summary.closedAt);

  return (
    <div class="space-y-3" data-testid="operator-day-summary">
      <Show when={props.summary.isDayClosed}>
        <div class="rounded-lg border border-fero-green/40 bg-fero-green/10 px-3 py-2.5">
          <p class="flex items-center gap-2 text-sm font-semibold text-fero-green-dark">
            <CheckCircle2 size={16} aria-hidden="true" />
            {props.summary.partialClose ? 'Jornada cerrada parcialmente' : 'Jornada cerrada'}
          </p>
          <p class="mt-1 text-xs text-text-secondary">
            Planificación cerró el día
            <Show when={closedLabel()}>
              {(label) => <> · {label()}</>}
            </Show>
            . Solo consulta — no puedes alterar el plan.
          </p>
        </div>
      </Show>

      <Show when={!props.summary.isDayClosed && props.summary.stopsTotal > 0}>
        <p class="text-sm text-text-secondary">
          Resumen de tu jornada de hoy. Los cambios al plan los realiza planificación.
        </p>
      </Show>

      <div class={`grid gap-3 ${props.compact ? 'sm:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
        <KpiCard
          title="Paradas completadas"
          value={`${props.summary.stopsDone}/${props.summary.stopsTotal}`}
          iconTone="green"
          footer={
            <div class="mt-1">
              <ProgressBar value={props.summary.progress} color="green" size="sm" />
              <span class="mt-1 block text-xs text-text-muted">{props.summary.progress}% de avance</span>
            </div>
          }
        />
        <KpiCard
          title="Incidencias reportadas"
          value={String(props.summary.incidentsCount)}
          iconTone="amber"
          footer={<span class="text-xs text-text-muted">Últimas 48 h</span>}
        />
        <KpiCard
          title="Distancia recorrida"
          value={formatOperatorDistanceKm(props.summary.traveledDistanceKm)}
          iconTone="blue"
          footer={
            <span class="text-xs text-text-muted">
              {props.summary.totalDistanceKm != null
                ? `de ${formatOperatorDistanceKm(props.summary.totalDistanceKm)} planificados`
                : 'Sin dato de kilometraje'}
            </span>
          }
        />
        <Show when={props.summary.vehicleId}>
          {(vehicleId) => (
            <KpiCard
              title="Vehículo"
              value={vehicleId()}
              iconTone="blue"
              footer={<span class="text-xs text-text-muted">{props.summary.operationDate}</span>}
            />
          )}
        </Show>
      </div>

      <div class="flex flex-wrap gap-3 text-xs text-text-muted">
        <span class="inline-flex items-center gap-1">
          <Route size={12} aria-hidden="true" />
          Paradas visitadas en tu ruta
        </span>
        <span class="inline-flex items-center gap-1">
          <Wrench size={12} aria-hidden="true" />
          Averías que reportaste
        </span>
        <Show when={props.summary.traveledDistanceKm != null}>
          <span class="inline-flex items-center gap-1">
            <MapPin size={12} aria-hidden="true" />
            Kilometraje estimado del recorrido
          </span>
        </Show>
      </div>
    </div>
  );
}
