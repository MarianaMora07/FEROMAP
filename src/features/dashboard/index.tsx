import { For, Show, onMount, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import {
  Trash2,
  Truck,
  AlertTriangle,
  TrafficCone,
  CirclePause,
  ArrowRight,
} from 'lucide-solid';
import {
  Badge,
  Card,
  CardHeader,
  KpiCard,
  ProgressBar,
} from '../../design-system/components';
import { canOptimize, isConductor, isResident } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import {
  activeRoutes as mockActiveRoutes,
  dashboardKpis as mockDashboardKpis,
  recentAlerts as mockRecentAlerts,
} from '../../data/mock/dashboard';
import { dashboardView, loadDashboardData } from '../../core/stores/dashboardStore';
import { PlanningWidgets } from './PlanningWidgets';
import { OperationalSituationPanel } from './OperationalSituationPanel';
import { OperatorHubSection } from '../operator/OperatorHubSection';
import { ResidentHubSection } from '../resident/ResidentHubSection';

const alertIcon: Record<'danger' | 'warning' | 'info', () => JSX.Element> = {
  danger: () => <AlertTriangle size={16} />,
  warning: () => <TrafficCone size={16} />,
  info: () => <CirclePause size={16} />,
};

const alertToneClass = {
  danger: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
  info: 'bg-fero-blue/10 text-fero-blue',
};

function ViewAllLink(props: { href: string; children: string }) {
  return (
    <A
      href={props.href}
      class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
    >
      {props.children}
      <ArrowRight size={14} />
    </A>
  );
}

export default function DashboardPage() {
  onMount(() => {
    void loadDashboardData();
  });

  const kpis = () => dashboardView()?.kpis ?? mockDashboardKpis;
  const residentSchedule = () => dashboardView()?.summary?.residentSchedule;
  const recentAlerts = () => dashboardView()?.recentAlerts ?? mockRecentAlerts;
  const activeRoutes = () => dashboardView()?.activeRoutes ?? mockActiveRoutes;

  const showPlannerActions = () => canOptimize(authUser()?.role);
  const showOperatorView = () => isConductor(authUser()?.role);
  const showResidentView = () => isResident(authUser()?.role);
  const showAdminOverview = () => !showPlannerActions() && !showOperatorView() && !showResidentView();

  return (
    <div class="space-y-4 md:space-y-5">
      <Show when={showResidentView()}>
        <ResidentHubSection variant="dashboard" />
      </Show>

      <Show when={showOperatorView()}>
        <OperatorHubSection variant="dashboard" />
      </Show>

      <Show when={showPlannerActions()}>
        <PlanningWidgets />
        <OperationalSituationPanel />
      </Show>

      <Show when={showAdminOverview() && residentSchedule()}>
        {(schedule) => (
          <div class="rounded-xl border border-fero-blue/30 bg-fero-blue/10 px-4 py-3">
            <p class="text-sm font-semibold text-fero-blue">{schedule().message}</p>
            <p class="mt-1 text-sm text-text-secondary">
              Sector {schedule().sectorName} · {schedule().collectionDays} · Próxima recolección:{' '}
              {schedule().nextCollection}
            </p>
          </div>
        )}
      </Show>

      <Show when={showAdminOverview()}>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Residuos recolectados hoy"
            value={kpis().wasteTons.value}
            unit={kpis().wasteTons.unit}
            icon={<Trash2 size={28} />}
            iconTone="green"
            trend={{ value: kpis().wasteTons.trend, direction: 'up' }}
            trendLabel="vs ayer"
          />
          <KpiCard
            title="Rutas completadas"
            value={`${kpis().routes.done} de ${kpis().routes.total}`}
            icon={<Truck size={28} />}
            iconTone="green"
            footer={<ProgressBar value={kpis().routes.done} max={kpis().routes.total} color="green" size="sm" />}
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
        </div>

        <p class="text-xs text-text-muted">
          Toneladas semanales y evolución histórica en{' '}
          <A href="/analytics" class="font-medium text-fero-blue hover:underline">
            Analítica
          </A>
          . Estado de flota y llenado por sector en{' '}
          <A href="/monitoring" class="font-medium text-fero-blue hover:underline">
            Monitoreo
          </A>{' '}
          y{' '}
          <A href="/collection-points" class="font-medium text-fero-blue hover:underline">
            Contenedores
          </A>
          .
        </p>

        <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Card class="w-full">
            <CardHeader title="Rutas en ejecución" />
            <ul class="space-y-4">
              <For each={activeRoutes()}>
                {(route) => (
                  <li class="space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <Badge variant={route.tone}>{route.id}</Badge>
                        <p class="mt-1.5 text-sm text-text-secondary">
                          {route.driver} · {route.vehicle}
                        </p>
                      </div>
                      <span class="text-sm font-semibold text-text-primary">{route.progress}%</span>
                    </div>
                    <ProgressBar value={route.progress} color="green" size="sm" />
                  </li>
                )}
              </For>
            </ul>
            <ViewAllLink href="/monitoring">Ver monitoreo operativo</ViewAllLink>
          </Card>

          <Card class="w-full">
            <CardHeader title="Alertas recientes" />
            <ul class="space-y-3">
              <For each={recentAlerts()}>
                {(alert) => (
                  <li class="flex gap-3">
                    <span
                      class={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${alertToneClass[alert.tone]}`}
                    >
                      {alertIcon[alert.tone]()}
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-start justify-between gap-2">
                        <p class="text-sm font-semibold text-text-primary">{alert.title}</p>
                        <span class="shrink-0 text-[11px] text-text-muted">{alert.time}</span>
                      </div>
                      <p class="text-xs text-text-muted">{alert.detail}</p>
                    </div>
                  </li>
                )}
              </For>
            </ul>
            <ViewAllLink href="/alerts">Ver todas las alertas</ViewAllLink>
          </Card>
        </div>
      </Show>
    </div>
  );
}
