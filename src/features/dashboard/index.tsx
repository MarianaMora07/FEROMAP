import { For, Show, onMount, type JSX } from 'solid-js';
import { A } from '@solidjs/router';
import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'solid-chartjs';
import {
  Trash2,
  Truck,
  AlertTriangle,
  TrafficCone,
  CirclePause,
  ArrowRight,
  Brain,
  Map,
  BarChart3,
  FileText,
} from 'lucide-solid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  KpiCard,
  ProgressBar,
} from '../../design-system/components';
import { canOptimize } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import {
  activeRoutes as mockActiveRoutes,
  dashboardKpis as mockDashboardKpis,
  fleetStatus as mockFleetStatus,
  recentAlerts as mockRecentAlerts,
  sectorFillLevels as mockSectorFillLevels,
  weeklyTons as mockWeeklyTons,
} from '../../data/mock/dashboard';
import { dashboardView, loadDashboardData } from '../../core/stores/dashboardStore';
import { analyticsHref, reportsHref, simulationResultsHref } from '../../core/utils/simulationLinks';
import { DashboardMiniMap } from './DashboardMiniMap';

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

function FleetDonut() {
  const fleetStatus = () => dashboardView()?.fleetStatus ?? mockFleetStatus;
  const data = () => ({
    labels: fleetStatus().items.map((i) => i.label),
    datasets: [
      {
        data: fleetStatus().items.map((i) => i.count),
        backgroundColor: fleetStatus().items.map((i) => i.color),
        borderWidth: 0,
        cutout: '72%',
      },
    ],
  });

  return (
    <Card>
      <CardHeader title="Estado de la flota" />
      <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div class="relative h-36 w-36 shrink-0">
          <Doughnut
            data={data()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { enabled: true } },
            }}
          />
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span class="font-heading text-2xl font-bold text-text-primary dark:text-white">
              {fleetStatus().total}
            </span>
            <span class="text-xs text-text-muted">Total</span>
          </div>
        </div>
        <ul class="w-full space-y-2">
          <For each={fleetStatus().items}>
            {(item) => (
              <li class="flex items-center justify-between gap-2 text-sm">
                <span class="flex items-center gap-2 text-text-secondary">
                  <span class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': item.color }} />
                  {item.label}
                </span>
                <span class="font-medium text-text-primary dark:text-white">
                  {item.count} <span class="text-xs text-text-muted">({item.pct}%)</span>
                </span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Card>
  );
}

function FillLevels() {
  const sectorFillLevels = () => dashboardView()?.sectorFillLevels ?? mockSectorFillLevels;
  return (
    <Card>
      <CardHeader title="Nivel de llenado (promedio)" />
      <ul class="space-y-3">
        <For each={sectorFillLevels()}>
          {(sector) => (
            <li>
              <div class="mb-1 flex items-center justify-between text-sm">
                <span class="text-text-secondary">{sector.name}</span>
                <span class="font-semibold text-text-primary dark:text-white">{sector.pct}%</span>
              </div>
              <ProgressBar value={sector.pct} size="sm" />
            </li>
          )}
        </For>
      </ul>
      <ViewAllLink href="/collection-points">Ver todos los sectores</ViewAllLink>
    </Card>
  );
}

function WeeklyChart() {
  const weeklyTons = () => dashboardView()?.weeklyTons ?? mockWeeklyTons;
  const data = () => ({
    labels: weeklyTons().labels,
    datasets: [
      {
        label: 'Toneladas',
        data: weeklyTons().values,
        backgroundColor: '#56E93D',
        borderRadius: 6,
        maxBarThickness: 28,
      },
    ],
  });

  return (
    <Card class="min-h-[280px]">
      <CardHeader title="Toneladas recolectadas (últimos 7 días)" />
      <div class="h-48">
        <Bar
          data={data()}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.25)' } },
            },
          }}
        />
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  onMount(() => {
    Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
    void loadDashboardData();
  });

  const kpis = () => dashboardView()?.kpis ?? mockDashboardKpis;
  const lastOptimization = () => dashboardView()?.lastOptimization;
  const residentSchedule = () => dashboardView()?.summary?.residentSchedule;
  const recentAlerts = () => dashboardView()?.recentAlerts ?? mockRecentAlerts;
  const activeRoutes = () => dashboardView()?.activeRoutes ?? mockActiveRoutes;

  const showPlannerActions = () => canOptimize(authUser()?.role);

  return (
    <div class="space-y-4 md:space-y-5">
      <Show when={showPlannerActions()}>
        <div class="flex flex-col gap-4 rounded-xl border border-fero-green/40 bg-linear-to-br from-fero-green/15 to-fero-blue/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wide text-fero-green-dark">Flujo principal</p>
            <h2 class="mt-1 font-heading text-lg font-bold text-text-primary dark:text-white">
              Evalúa escenarios de recolección
            </h2>
            <p class="mt-1 text-sm text-text-secondary">
              Configura condiciones, ejecuta una simulación y compara el impacto del algoritmo.
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <A href="/simulation">
              <Button variant="primary" class="gap-2" icon={<Brain size={16} />}>
                Nueva simulación
              </Button>
            </A>
            <A href="/optimization">
              <Button variant="outline" class="gap-2" icon={<Map size={16} />}>
                Planificación operativa
              </Button>
            </A>
          </div>
        </div>
      </Show>
      <Show when={residentSchedule()}>
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
      <Show when={lastOptimization()}>
        {(opt) => (
          <div class="rounded-xl border border-fero-green/30 bg-fero-green/10 px-4 py-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-fero-green-dark">
                  Última simulación — {opt().scenarioName}
                </p>
                <p class="mt-1 text-sm text-text-secondary">
                  Ahorro de {opt().savingPercentage.toFixed(1)}% en distancia ·{' '}
                  {opt().kpis.distanceKm.current} km → {opt().kpis.distanceKm.optimized} km ·{' '}
                  {opt().kpis.containersServed} contenedores atendidos
                </p>
              </div>
              <div class="flex shrink-0 flex-wrap gap-2">
                <A
                  href={simulationResultsHref(opt().simulationId)}
                  class="inline-flex items-center gap-1 rounded-md border border-fero-green/40 bg-white/60 px-3 py-1.5 text-sm font-medium text-fero-green-dark hover:bg-white dark:bg-dark-surface/60 dark:hover:bg-dark-surface"
                >
                  Ver resultados
                  <ArrowRight size={14} />
                </A>
                <A
                  href={analyticsHref(opt().simulationId)}
                  class="inline-flex items-center gap-1 rounded-md border border-fero-green/30 px-3 py-1.5 text-sm font-medium text-fero-green-dark hover:bg-white/40 dark:hover:bg-dark-surface/40"
                >
                  <BarChart3 size={14} />
                  Analítica
                </A>
                <A
                  href={reportsHref(opt().simulationId)}
                  class="inline-flex items-center gap-1 rounded-md border border-fero-green/30 px-3 py-1.5 text-sm font-medium text-fero-green-dark hover:bg-white/40 dark:hover:bg-dark-surface/40"
                >
                  <FileText size={14} />
                  Reportes
                </A>
              </div>
            </div>
          </div>
        )}
      </Show>
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
          footer={<ProgressBar value={kpis().vehicles.active} max={kpis().vehicles.total} color="blue" size="sm" />}
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

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div class="xl:col-span-2">
          <DashboardMiniMap />
        </div>
        <div class="space-y-4">
          <FleetDonut />
          <FillLevels />
        </div>
      </div>

      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <WeeklyChart />

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
                    <span class="text-sm font-semibold text-text-primary dark:text-white">
                      {route.progress}%
                    </span>
                  </div>
                  <ProgressBar value={route.progress} color="green" size="sm" />
                </li>
              )}
            </For>
          </ul>
          <ViewAllLink href="/optimization">Ver todas las rutas</ViewAllLink>
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
                      <p class="text-sm font-semibold text-text-primary dark:text-white">{alert.title}</p>
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
    </div>
  );
}
