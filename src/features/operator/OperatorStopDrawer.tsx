import { Show } from 'solid-js';
import { MapPin } from 'lucide-solid';
import { Drawer, Badge } from '../../design-system/components';
import type { OperatorRouteStop } from '../../core/api/operator';
import { operatorStopStatusLabel, operatorStopStatusVariant } from '../../core/api/operator';

interface OperatorStopDrawerProps {
  stop: OperatorRouteStop | null;
  open: boolean;
  onClose: () => void;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OperatorStopDrawer(props: OperatorStopDrawerProps) {
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={props.stop ? `Parada ${props.stop.sequenceOrder}` : 'Detalle de parada'}
    >
      <Show when={props.stop}>
        {(stop) => (
          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-heading text-lg font-bold text-text-primary dark:text-white">
                {stop().code}
              </h3>
              <Badge variant={operatorStopStatusVariant(stop().status)}>
                {operatorStopStatusLabel(stop().status)}
              </Badge>
            </div>

            <div class="space-y-3 text-sm">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Sector</p>
                <p class="text-text-primary dark:text-white">{stop().sectorName ?? '—'}</p>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Dirección</p>
                <p class="flex items-start gap-2 text-text-secondary">
                  <MapPin size={16} class="mt-0.5 shrink-0 text-fero-blue" />
                  {stop().address}
                </p>
              </div>
              <Show when={stop().notes}>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Notas</p>
                  <p class="text-text-secondary">{stop().notes}</p>
                </div>
              </Show>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Hora estimada
                  </p>
                  <p class="text-text-primary dark:text-white">
                    {formatDateTime(stop().estimatedArrivalAt)}
                  </p>
                </div>
                <Show when={stop().actualArrivalAt}>
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Hora real
                    </p>
                    <p class="text-text-primary dark:text-white">
                      {formatDateTime(stop().actualArrivalAt)}
                    </p>
                  </div>
                </Show>
              </div>
              <Show when={stop().fillLevelPct != null}>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Llenado</p>
                  <p class="text-text-secondary">{stop().fillLevelPct}%</p>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Drawer>
  );
}
