import { For, Show, createResource } from 'solid-js';
import { Calendar, MapPin, Route, Trash2, Truck } from 'lucide-solid';
import { Badge, Card, CardHeader, ProgressBar } from '../../design-system/components';
import { fetchResidentOverview } from '../../core/api/resident';

function fillTone(level: number) {
  if (level >= 80) return 'red' as const;
  if (level >= 60) return 'amber' as const;
  return 'green' as const;
}

export default function ResidentPage() {
  const [overview] = createResource(fetchResidentOverview);

  return (
    <div class="space-y-5">
      <Show when={overview.error}>
        <div class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar la información del residente.
        </div>
      </Show>

      <Show when={overview.loading}>
        <div class="flex h-40 items-center justify-center text-sm text-text-muted">Cargando...</div>
      </Show>

      <Show when={overview()}>
        {(data) => (
          <>
            <div class="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader title="Mi sector" />
                <div class="flex items-start gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-lg bg-fero-green/15 text-fero-green-dark">
                    <MapPin size={20} />
                  </span>
                  <div>
                    <p class="font-heading text-lg font-bold text-text-primary dark:text-white">
                      {data().sectorName}
                    </p>
                    <p class="mt-1 text-sm text-text-muted">
                      {data().stats.totalPoints} puntos de recolección en tu zona
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Horario de recolección" />
                <ul class="space-y-2 text-sm">
                  <li class="flex items-center gap-2 text-text-secondary">
                    <Calendar size={15} class="text-fero-blue" />
                    {data().schedule.collectionDays}
                  </li>
                  <li class="flex items-center gap-2 text-text-secondary">
                    <Truck size={15} class="text-fero-green-dark" />
                    {data().schedule.window}
                  </li>
                  <li class="font-medium text-fero-green-dark">{data().schedule.nextCollection}</li>
                </ul>
              </Card>

              <Card>
                <CardHeader title="Estado del servicio" />
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="rounded-md bg-slate-50 p-3 dark:bg-dark-surface-hover">
                    <p class="text-text-muted">Críticos</p>
                    <p class="text-xl font-bold text-red-600">{data().stats.criticalPoints}</p>
                  </div>
                  <div class="rounded-md bg-slate-50 p-3 dark:bg-dark-surface-hover">
                    <p class="text-text-muted">Rutas activas</p>
                    <p class="text-xl font-bold text-fero-blue">{data().stats.routesServingSector}</p>
                  </div>
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader title="Rutas que atienden tu sector" />
              <Show
                when={data().activeRoutesInSector.length > 0}
                fallback={
                  <p class="text-sm text-text-muted">
                    No hay rutas activas en este momento. La próxima recolección está programada según el
                    calendario del sector.
                  </p>
                }
              >
                <div class="overflow-x-auto">
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
                      <For each={data().activeRoutesInSector}>
                        {(route) => (
                          <tr>
                            <td class="py-2.5 pr-3 font-medium text-text-primary dark:text-white">
                              #{route.routeId}
                            </td>
                            <td class="py-2.5 pr-3 text-text-secondary">{route.vehicle}</td>
                            <td class="py-2.5 pr-3">
                              <Badge variant={route.status === 'in_progress' ? 'success' : 'info'}>
                                {route.status === 'in_progress' ? 'En curso' : 'Pendiente'}
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
              </Show>
            </Card>

            <Card>
              <CardHeader title="Contenedores en mi sector" />
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <For each={data().collectionPoints}>
                  {(point) => (
                    <div class="rounded-lg border border-border p-3 dark:border-dark-border">
                      <div class="mb-2 flex items-center justify-between gap-2">
                        <span class="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary dark:text-white">
                          <Trash2 size={14} class="text-fero-green-dark" />
                          {point.id}
                        </span>
                        <span class="text-xs font-semibold text-text-muted">{point.fillLevel}%</span>
                      </div>
                      <ProgressBar value={point.fillLevel} color={fillTone(point.fillLevel)} size="sm" />
                      <p class="mt-2 text-xs text-text-muted">{point.address}</p>
                    </div>
                  )}
                </For>
              </div>
            </Card>

            <Show when={data().alerts.length > 0}>
              <Card>
                <CardHeader title="Avisos" />
                <ul class="space-y-2">
                  <For each={data().alerts}>
                    {(alert) => (
                      <li class="flex gap-2 rounded-md border border-border px-3 py-2 text-sm dark:border-dark-border">
                        <Route size={16} class="mt-0.5 shrink-0 text-fero-blue" />
                        <div>
                          <p class="font-medium text-text-primary dark:text-white">{alert.title}</p>
                          <p class="text-text-muted">{alert.detail}</p>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Card>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
