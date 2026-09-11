import { For, Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, FileBarChart, History, Map, Route, Trash2, Truck } from 'lucide-solid';
import { Badge, Button, Card, CardHeader, KpiCard, ProgressBar } from '../../design-system/components';
import { dashboardView } from '../../core/stores/dashboardStore';
import { emptyDashboardKpis, type DashboardActiveRoute } from '../../core/api/dashboard';
import { driverDisplayName, fetchDrivers } from '../../core/api/drivers';
import { DashboardPlanVsRealKpi } from './DashboardPlanVsRealKpi';

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Punto de entrada del planificador (docs/plan-flujo-operativo.md): estado general
 * de la operación, última ruta en curso y equipo en turno, con accesos directos al
 * resto del sistema.
 */
export function PlannerOverviewSection() {
  const view = () => dashboardView();
  const kpis = () => view()?.kpis ?? emptyDashboardKpis;
  const activeRoutes = (): DashboardActiveRoute[] => view()?.activeRoutes ?? [];
  const criticalContainers = () => view()?.summary?.metrics?.criticalContainers ?? 0;
  const atRiskContainers = () => view()?.summary?.metrics?.atRiskContainers ?? 0;
  const soonestRiskHours = () => {
    const values = (view()?.summary?.atRiskContainers ?? [])
      .map((item) => item.hoursUntilCritical)
      .filter((value): value is number => value != null);
    return values.length > 0 ? Math.min(...values) : null;
  };
  const lastOptimization = () => view()?.lastOptimization ?? null;
  const driversOnShift = () => view()?.summary?.fleet?.driversOnShift ?? 0;
  const lastRoute = () => activeRoutes().at(-1) ?? null;

  const [drivers] = createResource(() => fetchDrivers());
  const activeDrivers = () => (drivers() ?? []).filter((driver) => driver.active);

  return (
    <section class="space-y-4" data-testid="planner-overview">
      <div>
        <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">Resumen general</h2>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          title="Residuos recolectados hoy"
          value={kpis().wasteTons.value}
          unit={kpis().wasteTons.unit}
          icon={<Trash2 size={28} />}
          iconTone="green"
          trend={
            kpis().wasteTons.trend > 0
              ? { value: kpis().wasteTons.trend, direction: 'up' }
              : undefined
          }
          trendLabel="vs ayer"
        />
        <KpiCard
          title="Rutas completadas"
          value={
            kpis().routes.total > 0
              ? `${kpis().routes.done} de ${kpis().routes.total}`
              : String(kpis().routes.done)
          }
          icon={<Route size={28} />}
          iconTone="green"
          footer={
            <ProgressBar
              value={kpis().routes.done}
              max={Math.max(kpis().routes.total, 1)}
              color="green"
              size="sm"
            />
          }
        />
        <KpiCard
          title="Vehículos activos"
          value={`${kpis().vehicles.active} de ${kpis().vehicles.total}`}
          icon={<Truck size={28} />}
          iconTone="blue"
          footer={
            <A href="/monitoring" class="text-sm font-medium text-fero-blue underline-offset-2 hover:underline">
              Ver flota en monitoreo
            </A>
          }
        />
        <KpiCard
          title="Alertas activas"
          value={`${kpis().alerts.count} alertas`}
          icon={<AlertTriangle size={28} />}
          iconTone="purple"
          footer={
            <A href="/alerts" class="text-sm font-medium text-fero-blue underline-offset-2 hover:underline">
              Requieren atención
            </A>
          }
        />
        <KpiCard
          title="Contenedores críticos"
          value={criticalContainers()}
          unit="contenedores"
          icon={<Trash2 size={28} />}
          iconTone="red"
          footer={
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-red-600">
                Crítico ahora
              </span>
              <A
                href="/collection-points"
                class="text-sm font-medium text-fero-blue underline-offset-2 hover:underline"
              >
                Revisar
              </A>
            </div>
          }
        />
        <KpiCard
          title="En riesgo de rebose"
          value={atRiskContainers()}
          unit="contenedores"
          icon={<AlertTriangle size={28} />}
          iconTone="amber"
          footer={
            <span class="text-sm text-text-muted">
              {soonestRiskHours() != null
                ? `Se llena en ~${Math.max(0, Math.round(soonestRiskHours()!))} h`
                : 'Se llenarán antes de la próxima visita'}
            </span>
          }
        />
        <DashboardPlanVsRealKpi />
      </div>

      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card class="w-full">
          <CardHeader
            title="Última ruta"
            subtitle="Seguimiento en vivo"
            action={
              <A href="/monitoring" class="text-xs font-medium text-fero-blue hover:underline">
                Monitoreo
              </A>
            }
          />
          <Show
            when={lastRoute()}
            fallback={
              <Show
                when={lastOptimization()}
                fallback={
                  <p class="text-sm text-text-secondary">
                    Sin rutas en ejecución ni optimizaciones recientes.
                  </p>
                }
              >
                {(opt) => (
                  <div class="space-y-1.5">
                    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Última optimización
                    </p>
                    <p class="text-sm font-semibold text-text-primary dark:text-white">
                      {opt().scenarioName}
                    </p>
                    <p class="text-xs text-text-muted">
                      Ahorro {Math.round(opt().savingPercentage)}% ·{' '}
                      {opt().kpis.distanceKm.optimized.toFixed(1)} km
                      <Show when={opt().executedAt}>
                        {' · '}
                        {opt().executedAt?.slice(0, 10)}
                      </Show>
                    </p>
                  </div>
                )}
              </Show>
            }
          >
            {(route) => (
              <div class="space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <Badge variant={route().tone === 'success' ? 'success' : 'info'}>{route().id}</Badge>
                    <p class="mt-1.5 truncate text-sm font-semibold text-text-primary dark:text-white">
                      {route().driver}
                    </p>
                    <p class="text-xs text-text-muted">
                      Vehículo {route().vehicle}
                      <Show when={route().waypointsTotal}>
                        {' · '}
                        {route().waypointsDone ?? 0}/{route().waypointsTotal} paradas
                      </Show>
                    </p>
                  </div>
                  <span class="shrink-0 text-sm font-semibold text-text-primary">{route().progress}%</span>
                </div>
                <ProgressBar value={route().progress} color="green" size="sm" />
                <p class="text-xs text-text-muted">
                  {activeRoutes().length} ruta{activeRoutes().length === 1 ? '' : 's'} en ejecución
                </p>
              </div>
            )}
          </Show>
        </Card>

        <Card class="w-full">
          <CardHeader
            title="Conductores"
            subtitle={`${driversOnShift()} en turno`}
            action={
              <A href="/drivers" class="text-xs font-medium text-fero-blue hover:underline">
                Gestionar
              </A>
            }
          />
          <Show
            when={activeDrivers().length > 0}
            fallback={<p class="text-sm text-text-secondary">Sin conductores activos registrados.</p>}
          >
            <ul class="space-y-2">
              <For each={activeDrivers().slice(0, 4)}>
                {(driver) => (
                  <li class="flex items-center justify-between gap-2">
                    <div class="flex min-w-0 items-center gap-2">
                      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fero-blue/10 text-xs font-semibold text-fero-blue">
                        {initials(driver.firstName, driver.lastName)}
                      </span>
                      <span class="truncate text-sm text-text-primary dark:text-white">
                        {driverDisplayName(driver)}
                      </span>
                    </div>
                    <span class="shrink-0 text-xs text-text-muted">
                      {driver.assignedVehicles} veh.
                    </span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={activeDrivers().length > 4}>
              <A href="/drivers" class="mt-3 inline-block text-xs font-medium text-fero-blue hover:underline">
                +{activeDrivers().length - 4} conductores más
              </A>
            </Show>
          </Show>
        </Card>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Accesos</span>
        <A href="/map">
          <Button size="sm" variant="outline" class="gap-2" icon={<Map size={14} />}>
            Mapa GIS
          </Button>
        </A>
        <A href="/reports">
          <Button size="sm" variant="outline" class="gap-2" icon={<FileBarChart size={14} />}>
            Reportes
          </Button>
        </A>
        <A href="/planning/history">
          <Button size="sm" variant="outline" class="gap-2" icon={<History size={14} />}>
            Historial
          </Button>
        </A>
      </div>
    </section>
  );
}
