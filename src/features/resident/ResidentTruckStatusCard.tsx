import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
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

function relativeFrom(iso: string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 15) return 'hace un momento';
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

export function ResidentTruckStatusCard(props: ResidentTruckStatusCardProps) {
  const [nowMs, setNowMs] = createSignal(Date.now());

  onMount(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    onCleanup(() => window.clearInterval(timer));
  });

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

  const isLive = () => phase() === 'approaching' || phase() === 'in_sector';
  const isStale = createMemo(() => {
    const iso = proximity()?.lastUpdatedAt;
    if (!iso || !isLive()) return false;
    return nowMs() - new Date(iso).getTime() > 90_000;
  });

  const updatedLabel = createMemo(() => {
    const iso = proximity()?.lastUpdatedAt;
    if (!iso) return 'Sin actualización reciente';
    return `Actualizado ${relativeFrom(iso, nowMs())}`;
  });

  return (
    <Card data-testid="resident-truck-status-card">
      <CardHeader
        title="Estado del camión"
        subtitle={updatedLabel()}
        action={
          <Show when={isLive()}>
            <span
              class={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isStale()
                  ? 'border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-fero-green/40 bg-fero-green/10 text-fero-green-dark'
              }`}
            >
              <span
                class={`h-1.5 w-1.5 rounded-full ${isStale() ? 'bg-amber-500' : 'animate-pulse bg-fero-green'}`}
                aria-hidden="true"
              />
              {isStale() ? 'Retrasado' : 'En vivo'}
            </span>
          </Show>
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
              <span class="inline-flex items-center gap-1 rounded-full bg-fero-blue/10 px-2 py-0.5 text-xs font-semibold text-fero-blue">
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
            <div class="flex items-center gap-2 rounded-md border border-fero-blue/30 bg-fero-blue/5 px-3 py-2 text-sm">
              <Radio size={16} class="shrink-0 animate-pulse text-fero-blue" />
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
              class="inline-block transition-transform duration-150 hover:-translate-y-0.5"
            >
              <Button
                variant={phase() === 'approaching' ? 'gradient' : 'outline'}
                size="sm"
                class="gap-2"
              >
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
