import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { operatorMapHref, operatorMonitoringHref } from '../../core/operator/operatorDeepLinks';
import { ChevronDown, ChevronUp, Crosshair, MapPin, Navigation } from 'lucide-solid';
import { Button, Card, ProgressBar, StatusBadge } from '../../design-system/components';
import type { OperatorRouteSnapshot } from '../../core/api/operator';
import type { LiveVehicle } from '../../core/api/monitoring';

interface OperatorNextStopCardProps {
  snapshot: OperatorRouteSnapshot | undefined;
  vehicle: LiveVehicle | null;
  onNavigate: () => void;
}

export function OperatorNextStopCard(props: OperatorNextStopCardProps) {
  const nextCode = () => props.snapshot?.nextStop?.code ?? props.vehicle?.nextPoint ?? '—';
  const nextAddress = () => props.snapshot?.nextStop?.address ?? props.vehicle?.route ?? '';

  return (
    <Card
      class="border-fero-blue/40 bg-fero-blue/5"
      data-testid="operator-next-stop-card"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wide text-fero-blue">Siguiente parada</p>
          <p class="mt-0.5 font-heading text-xl font-bold text-text-primary dark:text-white">
            Próxima: {nextCode()}
          </p>
          <Show when={nextAddress()}>
            <p class="mt-1 truncate text-sm text-text-secondary">{nextAddress()}</p>
          </Show>
        </div>
        <Button
          variant="primary"
          size="lg"
          class="w-full shrink-0 gap-2 sm:w-auto min-h-12"
          onClick={() => props.onNavigate()}
        >
          <Navigation size={18} />
          Ver en mapa
        </Button>
      </div>
    </Card>
  );
}

interface OperatorFieldBottomPanelProps {
  open: boolean;
  onToggle: () => void;
  vehicle: LiveVehicle | null;
  snapshot: OperatorRouteSnapshot | undefined;
  operationDate?: string;
  onCenterVehicle: () => void;
}

export function OperatorFieldBottomPanel(props: OperatorFieldBottomPanelProps) {
  const linkParams = () => ({
    date: props.operationDate,
    vehicleId: props.vehicle?.id ?? props.snapshot?.vehicleId,
  });
  const mapHref = () => operatorMapHref({ ...linkParams(), focus: 'route' });
  const monitoringHref = () => operatorMonitoringHref(linkParams());
  const progressLabel = () => {
    const snapshot = props.snapshot;
    if (snapshot && snapshot.stopsTotal > 0) {
      return `${snapshot.stopsDone} de ${snapshot.stopsTotal} paradas`;
    }
    return props.vehicle ? `${props.vehicle.progress}% de avance` : 'Sin ruta activa';
  };

  return (
    <div
      class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:border-dark-border dark:bg-dark-surface md:static md:rounded-xl md:border md:shadow-sm"
      data-testid="operator-field-bottom-panel"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:hidden"
        onClick={() => props.onToggle()}
        aria-expanded={props.open}
      >
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Mi ruta</p>
          <p class="truncate font-semibold text-text-primary dark:text-white">
            {props.vehicle?.id ?? 'Sin vehículo'} · {progressLabel()}
          </p>
        </div>
        {props.open ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
      </button>

      <div
        class={`overflow-hidden transition-[max-height] duration-300 md:max-h-none ${
          props.open ? 'max-h-[70vh]' : 'max-h-0 md:max-h-none'
        }`}
      >
        <div class="space-y-3 px-4 pb-4 pt-0 md:px-5 md:py-4">
          <Show when={props.vehicle}>
            {(vehicle) => (
              <div class="hidden items-start gap-3 md:flex">
                <img
                  src={vehicle().image}
                  alt={vehicle().id}
                  class="h-14 w-[4.5rem] shrink-0 rounded-md object-cover bg-slate-100"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-heading text-lg font-bold text-text-primary dark:text-white">
                      {vehicle().id}
                    </span>
                    <StatusBadge status={vehicle().status} />
                  </div>
                  <p class="text-sm text-text-secondary">{vehicle().route}</p>
                  <p class="text-xs text-text-muted">{vehicle().driver}</p>
                  <div class="mt-2 flex items-center gap-2">
                    <ProgressBar value={vehicle().progress} color="green" size="sm" class="flex-1" />
                    <span class="text-xs font-semibold text-text-secondary">{vehicle().progress}%</span>
                  </div>
                  <p class="mt-1 text-xs text-text-muted">{progressLabel()}</p>
                </div>
              </div>
            )}
          </Show>

          <div class="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="lg"
              class="min-h-12 flex-1 gap-2"
              onClick={() => props.onCenterVehicle()}
            >
              <Crosshair size={18} />
              Centrar vehículo
            </Button>
            <A href={mapHref()} class="flex-1">
              <Button variant="outline" size="lg" class="min-h-12 w-full gap-2">
                <MapPin size={18} />
                Mapa mi ruta
              </Button>
            </A>
            <A href={monitoringHref()} class="flex-1 sm:hidden">
              <Button variant="outline" size="lg" class="min-h-12 w-full gap-2">
                Monitoreo
              </Button>
            </A>
            <A href="/operator" class="flex-1">
              <Button variant="outline" size="lg" class="min-h-12 w-full gap-2">
                <MapPin size={18} />
                Mi operación
              </Button>
            </A>
            <A href="/operator/plan" class="flex-1">
              <Button variant="outline" size="lg" class="min-h-12 w-full gap-2">
                Ver plan del día
              </Button>
            </A>
          </div>
        </div>
      </div>
    </div>
  );
}
