import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import type { ResidentOverview } from '../../core/api/resident';
import { residentHubHref, residentPointsHref } from '../../core/resident/residentDeepLinks';
import { ResidentBreadcrumbs } from '../resident/ResidentBreadcrumbs';

export interface MapResidentOverlaysProps {
  residentMode: boolean;
  overview?: ResidentOverview;
}

export function MapResidentOverlays(props: MapResidentOverlaysProps) {
  return (
    <>
      <Show when={props.residentMode}>
        <div class="absolute inset-x-0 top-14 z-20 mx-3">
          <ResidentBreadcrumbs
            items={[
              { label: 'Mi Recolección', href: residentHubHref() },
              { label: 'Mapa mi sector' },
            ]}
          />
        </div>
      </Show>

      <Show when={props.residentMode && props.overview}>
        {(overview) => (
          <div
            role="status"
            class="absolute inset-x-0 top-[4.25rem] z-20 mx-3 rounded-lg border border-fero-green/30 bg-elevated/95 px-3 py-2 text-sm shadow-sm backdrop-blur-sm"
          >
            <p class="font-semibold text-fero-green-dark dark:text-fero-green">
              Mi sector — {overview().sectorName}
            </p>
            <p class="text-xs text-text-secondary">
              {overview().stats.totalPoints} contenedores
              <Show when={overview().proximity.vehicleCode}>
                {(code) => (
                  <span>
                    {' '}
                    · Camión <strong class="text-text-primary">{code()}</strong>
                  </span>
                )}
              </Show>
              <Show when={overview().proximity.nextStopInSector}>
                {(stop) => (
                  <span>
                    {' '}
                    · Próxima parada: <strong class="text-text-primary">{stop()}</strong>
                  </span>
                )}
              </Show>
            </p>
            <A
              href={residentPointsHref()}
              class="mt-1 inline-flex items-center gap-1 text-xs font-medium text-fero-blue hover:underline"
            >
              Ver puntos de recolección
            </A>
          </div>
        )}
      </Show>
    </>
  );
}
