import { Show, createSignal } from 'solid-js';
import { MapPin, Navigation, CheckCircle2, CircleSlash } from 'lucide-solid';
import { Drawer, Badge, Button } from '../../design-system/components';
import type { OperatorRouteStop } from '../../core/api/operator';
import { operatorStopStatusLabel, operatorStopStatusVariant } from '../../core/api/operator';
import { confirmOperatorStop } from '../../core/api/operator';
import { globalToast } from '../../core/stores/toastStore';

interface OperatorStopDrawerProps {
  stop: OperatorRouteStop | null;
  open: boolean;
  onClose: () => void;
  /** F5b: botones de confirmación solo si el flag está activo y hay routeId. */
  stopConfirmationEnabled?: boolean;
  routeId?: number | null;
  onConfirmed?: () => void;
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
  const [busy, setBusy] = createSignal(false);
  const canConfirm = () =>
    props.stopConfirmationEnabled === true &&
    props.routeId != null &&
    props.stop?.status === 'pending' &&
    props.stop?.stopType !== 'landfill';

  const confirm = async (outcome: 'visited' | 'omitted') => {
    const stop = props.stop;
    const routeId = props.routeId;
    if (!stop || routeId == null || busy()) return;
    setBusy(true);
    try {
      await confirmOperatorStop(routeId, {
        waypointId: stop.waypointId,
        outcome,
      });
      globalToast.addToast(
        outcome === 'visited' ? 'Parada marcada como visitada' : 'Parada omitida',
        'success',
      );
      props.onConfirmed?.();
      props.onClose();
    } catch (error) {
      globalToast.addToast(
        error instanceof Error ? error.message : 'No se pudo confirmar la parada',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const mapsHref = () => {
    const stop = props.stop;
    if (stop?.lng == null || stop?.lat == null) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
  };

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
              <Show when={stop().fillLevelPct != null && (stop().fillLevelPct ?? 0) >= 80}>
                <Badge variant="danger" size="sm">
                  Llenado crítico {stop().fillLevelPct}%
                </Badge>
              </Show>
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

            <Show when={mapsHref()}>
              {(href) => (
                <a
                  href={href()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-default px-4 py-2.5 text-sm font-medium text-fero-blue hover:bg-surface-hover"
                >
                  <Navigation size={16} />
                  Navegar a este punto
                </a>
              )}
            </Show>

            <Show when={canConfirm()}>
              <div class="flex flex-col gap-2 border-t border-default pt-3" data-testid="stop-confirm-actions">
                <Button
                  variant="primary"
                  class="min-h-12 w-full gap-2"
                  disabled={busy()}
                  onClick={() => void confirm('visited')}
                >
                  <CheckCircle2 size={16} />
                  Marcar visitada
                </Button>
                <Button
                  variant="outline"
                  class="min-h-12 w-full gap-2"
                  disabled={busy()}
                  onClick={() => void confirm('omitted')}
                >
                  <CircleSlash size={16} />
                  Omitir parada
                </Button>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </Drawer>
  );
}
