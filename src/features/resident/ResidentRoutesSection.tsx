import { For, Show } from 'solid-js';
import { Badge, Card, CardHeader } from '../../design-system/components';
import type { ResidentActiveRoute } from '../../core/api/resident';

interface ResidentRoutesSectionProps {
  routes: ResidentActiveRoute[];
}

function routeStatusLabel(status: string) {
  return status === 'in_progress' ? 'En curso' : 'Pendiente';
}

function RouteCard(props: { route: ResidentActiveRoute }) {
  const route = () => props.route;
  return (
    <article class="rounded-lg border border-border bg-surface p-3 dark:border-dark-border dark:bg-dark-surface/50">
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="font-heading text-sm font-bold text-text-primary dark:text-white">
          Ruta #{route().routeId}
        </p>
        <Badge variant={route().status === 'in_progress' ? 'success' : 'info'}>
          {routeStatusLabel(route().status)}
        </Badge>
      </div>
      <dl class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt class="text-text-muted">Vehículo</dt>
          <dd class="font-medium text-text-primary dark:text-white">{route().vehicle}</dd>
        </div>
        <div>
          <dt class="text-text-muted">Paradas pendientes</dt>
          <dd class="font-medium text-text-primary dark:text-white">
            {route().pendingStops}/{route().stopsInSector}
          </dd>
        </div>
        <div class="col-span-2">
          <dt class="text-text-muted">Próxima parada</dt>
          <dd class="font-medium text-text-primary dark:text-white">{route().nextStop ?? '—'}</dd>
        </div>
      </dl>
    </article>
  );
}

export function ResidentRoutesSection(props: ResidentRoutesSectionProps) {
  return (
    <Card data-testid="resident-routes-section">
      <CardHeader
        title="Rutas que atienden tu sector"
        subtitle="Detalle operativo de tu barrio"
      />
      <div class="space-y-3 md:hidden">
        <For each={props.routes}>{(route) => <RouteCard route={route} />}</For>
      </div>
      <div class="hidden overflow-x-auto md:block">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
              <th class="pb-2 pr-3 font-semibold">Ruta</th>
              <th class="pb-2 pr-3 font-semibold">Vehículo</th>
              <th class="pb-2 pr-3 font-semibold">Estado</th>
              <th class="pb-2 pr-3 font-semibold">Paradas en sector</th>
              <th class="pb-2 font-semibold">Próxima parada</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border dark:divide-dark-border">
            <For each={props.routes}>
              {(route) => (
                <tr>
                  <td class="py-2.5 pr-3 font-medium text-text-primary dark:text-white">
                    #{route.routeId}
                  </td>
                  <td class="py-2.5 pr-3 text-text-secondary">{route.vehicle}</td>
                  <td class="py-2.5 pr-3">
                    <Badge variant={route.status === 'in_progress' ? 'success' : 'info'}>
                      {routeStatusLabel(route.status)}
                    </Badge>
                  </td>
                  <td class="py-2.5 pr-3 text-text-secondary">
                    {route.pendingStops}/{route.stopsInSector} pendientes
                  </td>
                  <td class="py-2.5 text-text-secondary">{route.nextStop ?? '—'}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
