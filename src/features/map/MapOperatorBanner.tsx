import { Show } from 'solid-js';
import type { OperatorRouteSnapshot } from '../../core/api/operator';

export interface MapOperatorBannerProps {
  operatorMode: boolean;
  snapshot?: OperatorRouteSnapshot;
}

export function MapOperatorBanner(props: MapOperatorBannerProps) {
  return (
    <Show when={props.operatorMode && (props.snapshot?.stops.length ?? 0) > 0}>
      <div class="absolute inset-x-0 top-14 z-20 mx-3 rounded-lg border border-fero-blue/30 bg-elevated/95 px-3 py-2 text-sm shadow-sm backdrop-blur-sm">
        <p class="font-semibold text-fero-blue">Mi ruta hoy</p>
        <p class="text-xs text-text-secondary">
          {props.snapshot?.vehicleId} · {props.snapshot?.stopsDone}/{props.snapshot?.stopsTotal}{' '}
          paradas
          <Show when={props.snapshot?.nextStop}>
            {(stop) => (
              <span>
                {' '}
                · Próxima: <strong class="text-text-primary">{stop().code}</strong>
              </span>
            )}
          </Show>
        </p>
      </div>
    </Show>
  );
}
