import { For, Show } from 'solid-js';
import { CheckCircle2 } from 'lucide-solid';
import { Badge } from '../../design-system/components';
import { buildResultsTotals, buildRouteResults } from '../../core/utils/optimizationResults';

interface OptimizationResultsCompactProps {
  routeResults: ReturnType<typeof buildRouteResults>;
  totals: ReturnType<typeof buildResultsTotals>;
  driverByVehicleId?: Record<string, string>;
}

export function OptimizationResultsCompact(props: OptimizationResultsCompactProps) {
  return (
    <div
      class="rounded-xl border border-default bg-elevated/50 p-3"
      data-testid="optimization-results-compact"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">Resultados</h3>
        <Badge variant="success" class="gap-1">
          <CheckCircle2 size={12} />
          Ruta óptima encontrada
        </Badge>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr class="border-b border-default text-xs text-text-muted">
              <th class="pb-2 pr-3 font-medium">Vehículo</th>
              <th class="pb-2 pr-3 font-medium">Distancia</th>
              <th class="pb-2 pr-3 font-medium">Tiempo</th>
              <th class="pb-2 pr-3 font-medium">Puntos</th>
              <th class="pb-2 pr-3 font-medium">Toneladas</th>
              <th class="pb-2 font-medium">Capacidad</th>
            </tr>
          </thead>
        </table>
        <div class="max-h-44 overflow-y-auto">
          <table class="w-full min-w-[32rem] text-left text-sm">
            <tbody>
              <For each={props.routeResults}>
                {(route) => (
                  <tr class="border-b border-default/60 last:border-0">
                    <td class="py-2 pr-3 font-semibold text-text-primary">
                      {route.id}
                      <Show when={props.driverByVehicleId?.[route.id]}>
                        <p class="text-[11px] font-normal text-text-muted">
                          {props.driverByVehicleId![route.id]}
                        </p>
                      </Show>
                    </td>
                    <td class="py-2 pr-3 text-text-secondary">{route.distanceKm} km</td>
                    <td class="py-2 pr-3 text-text-secondary">{route.duration}</td>
                    <td class="py-2 pr-3 text-text-secondary">{route.points}</td>
                    <td class="py-2 pr-3 text-text-secondary">{route.tons} ton</td>
                    <td class="py-2 text-text-secondary">{route.capacityPct}%</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <table class="w-full min-w-[32rem] text-left text-sm">
          <tfoot>
            <tr class="text-xs text-text-muted">
              <td class="pt-2 pr-3 font-semibold text-text-secondary">Total</td>
              <td class="pt-2 pr-3">{props.totals.distanceKm} km</td>
              <td class="pt-2 pr-3">{props.totals.duration}</td>
              <td class="pt-2 pr-3">—</td>
              <td class="pt-2 pr-3">{props.totals.tons} ton</td>
              <td class="pt-2">{props.totals.fuelL} L comb.</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
