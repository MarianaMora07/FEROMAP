import { Show, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight, CheckCircle2, Radio, Truck } from 'lucide-solid';
import { Badge, Button, Card, CardHeader, ProgressBar } from '../../design-system/components';
import type { ResidentFieldContext } from '../../core/resident/residentUx';
import {
  residentProximityBadgeVariant,
  residentProximityBadgeClass,
  residentProximityDetail,
  residentProximityStatusLabel,
} from '../../core/resident/residentProximityUx';
import { residentMapHref } from '../../core/resident/residentDeepLinks';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';
import { RESIDENT_EMPTY_PRESETS } from '../../core/resident/residentEmptyStates';

interface ResidentTruckStatusCardProps {
  context: ResidentFieldContext;
  sectorId?: number | null;
}

export function ResidentTruckStatusCard(props: ResidentTruckStatusCardProps) {
  const proximity = () => props.context.proximity;
  const phase = () => props.context.phase;
  const route = () => props.context.primaryRoute;

  const progressPct = createMemo(() => {
    const prox = proximity();
    if (prox && prox.totalStopsInSector > 0) {
      return Math.round((prox.completedStopsInSector / prox.totalStopsInSector) * 100);
    }
    const r = route();
    if (!r || r.stopsInSector === 0) return 0;
    return Math.round(((r.stopsInSector - r.pendingStops) / r.stopsInSector) * 100);
  });

  const showActive = () =>
    phase() === 'approaching' || phase() === 'in_sector' || phase() === 'completed_today';

  const emptyPreset = () => {
    const status = proximity()?.status;
    if (status === 'not_scheduled') return RESIDENT_EMPTY_PRESETS.notScheduledToday;
    if (phase() === 'no_active_route' && !props.context.isWithinWindow) {
      return RESIDENT_EMPTY_PRESETS.outsideCollectionWindow;
    }
    if (phase() === 'no_active_route') {
      return RESIDENT_EMPTY_PRESETS.noRouteToday;
    }
    return RESIDENT_EMPTY_PRESETS.noActiveRoutesInWindow;
  };

  const vehicleCode = () => proximity()?.vehicleCode ?? route()?.vehicle ?? '—';
  const nextStop = () => proximity()?.nextStopInSector ?? route()?.nextStop;
  const statusLabel = () =>
    proximity()
      ? residentProximityStatusLabel(proximity()!.status)
      : phase() === 'completed_today'
        ? 'Ya pasó hoy'
        : 'Sin camión en ruta';

  return (
    <Card data-testid="resident-truck-status-card">
      <CardHeader
        title="Estado del camión"
        subtitle={
          proximity()?.lastUpdatedAt
            ? `Actualizado ${new Date(proximity()!.lastUpdatedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`
            : 'Seguimiento en vivo'
        }
      />
      <Show when={showActive()} fallback={<PlanningEmptyState {...emptyPreset()} compact />}>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <Badge
              variant={residentProximityBadgeVariant(proximity()?.status ?? 'approaching')}
              class={residentProximityBadgeClass(proximity()?.status ?? 'approaching')}
            >
              {statusLabel()}
            </Badge>
            <Show when={props.context.estimatedMinutes != null && phase() === 'approaching'}>
              <span class="text-xs font-medium text-fero-blue">
                ETA ~{props.context.estimatedMinutes} min
              </span>
            </Show>
          </div>

          <p class="text-sm text-text-secondary">
            {proximity()
              ? residentProximityDetail(proximity()!.status)
              : 'Consulta el avance del camión en tu sector.'}
          </p>

          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-lg bg-fero-green/15 text-fero-green-dark">
              <Show when={phase() === 'completed_today'} fallback={<Truck size={20} />}>
                <CheckCircle2 size={20} />
              </Show>
            </span>
            <div>
              <p class="font-heading text-lg font-bold text-text-primary dark:text-white">
                {vehicleCode()}
              </p>
              <Show when={route()}>
                {(r) => (
                  <p class="text-sm text-text-muted">
                    Ruta #{r().routeId}
                    <Show when={proximity()?.stopsBeforeSector}>
                      {' '}
                      · {proximity()!.stopsBeforeSector} parada(s) antes de tu sector
                    </Show>
                  </p>
                )}
              </Show>
              <Show when={nextStop() && phase() !== 'completed_today'}>
                <p class="mt-1 text-sm text-text-secondary">
                  Próxima parada en sector:{' '}
                  <strong class="text-text-primary dark:text-white">{nextStop()}</strong>
                </p>
              </Show>
            </div>
          </div>

          <Show when={phase() === 'in_sector' || phase() === 'completed_today'}>
            <div>
              <div class="mb-1 flex justify-between text-xs text-text-muted">
                <span>Avance en tu sector</span>
                <span>{progressPct()}%</span>
              </div>
              <ProgressBar
                value={progressPct()}
                color={phase() === 'completed_today' ? 'blue' : 'green'}
                size="sm"
              />
            </div>
          </Show>

          <Show when={phase() === 'approaching'}>
            <div class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm dark:border-dark-border">
              <Radio size={16} class="shrink-0 text-fero-blue" />
              <span class="text-text-secondary">
                El vehículo se acerca a tu barrio. Sigue su ubicación en el mapa.
              </span>
            </div>
          </Show>

          <Show when={phase() !== 'completed_today'}>
            <A
              href={residentMapHref({
                focus: phase() === 'in_sector' ? 'routes' : 'truck',
                sectorId: props.sectorId ?? undefined,
              })}
            >
              <Button variant="outline" size="sm" class="gap-2">
                Ver camión en mapa
                <ArrowRight size={14} />
              </Button>
            </A>
          </Show>
        </div>
      </Show>
    </Card>
  );
}
