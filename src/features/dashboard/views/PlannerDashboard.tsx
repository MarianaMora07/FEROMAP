import { Show, createMemo, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { ArrowRight, AlertTriangle, Clock, Download, Leaf, Route, Trash2, Truck, Zap, Map, FileBarChart, History, Shield, CheckCircle, XCircle, MapPin, Package, Clock as ClockIcon, CheckCircle2, XCircle as XCircleIcon, MapPin as MapPinIcon, Bell, ShieldCheck, CalendarDays, Trash2 as Trash2Icon, Package as PackageIcon, Leaf as LeafIcon, Recycle as RecycleIcon, Clock as ClockIcon2, MapPin as MapPinIcon2 } from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard, ProgressBar, Badge } from '../../design-system/components';
import { fetchDashboardAnalytics, fetchDashboardSummary } from '../../core/api/dashboard';
import { SparklineKpiCard, MetricCard, LineChart, BarChart, DoughnutChart, ChartCard, KpiGrid, SectorHeatmap } from '../components';
import { globalToast } from '../../core/stores/toastStore';
import { dashboardView, loadDashboardData } from '../../core/stores/dashboardStore';
import { dashboardSummary } from '../../core/stores/dashboardStore';
import { DashboardAnalyticsContent } from '../DashboardAnalyticsContent';

const GRANULARITY_OPTIONS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
] as const;

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'custom', label: 'Personalizado' },
] as const;

const ICON_MAP: Record<string, () => JSX.Element> = {
  trash: () => <Trash2Icon className="w-5 h-5" />,
  route: () => <Route className="w-5 h-5" />,
  truck: () => <Truck className="w-5 h-5" />,
  leaf: () => <Leaf className="w-5 h-5" />,
  clock: () => <Clock className="w-5 h-5" />,
  zap: () => <Zap className="w-5 h-5" />,
  map: () => <Map className="w-5 h-5" />,
  file: () => <FileBarChart className="w-5 h-5" />,
  history: () => <History className="w-5 h-5" />,
  alert: () => <AlertTriangle className="w-5 h-5" />,
  mapPin: () => <MapPin className="w-5 h-5" />,
};

const TONE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  green: { bg: 'bg-fero-green/10', border: 'border-fero-green/30', text: 'text-fero-green-dark' },
  blue: { bg: 'bg-fero-blue/10', border: 'border-fero-blue/30', text: 'text-fero-blue' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600' },
  red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-600' },
  purple: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-600' },
};

export function PlannerDashboard() {
  return (
    <div className="space-y-4 md:space-y-5" data-testid="planner-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-text-primary dark:text-white">Panel de Planificación</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Vista global de la operación: KPIs, alertas, planificación y optimización
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Zap className="w-4 h-4" />}>
            Nueva optimización
          </Button>
          <Button variant="outline" className="gap-2" icon={<Map className="w-4 h-4" />}>
            Monitoreo
          </Button>
          <Button variant="outline" className="gap-2" icon={<FileBarChart className="w-4 h-4" />}>
            Reporte
          </Button>
        </div>
      </div>

      <DashboardSummarySection />
      <SectorHeatmap height={350} />
      <DashboardAnalyticsSection />
      <PlannerActionSection />
    </div>
  );
}

function DashboardSummarySection() {
  const view = () => dashboardView();
  const kpis = () => view()?.kpis ?? { wasteTons: { value: '0.00', unit: 'toneladas', trend: 0 }, routes: { done: 0, total: 0 }, vehicles: { active: 0, total: 0 }, alerts: { count: 0 } };
  const activeRoutes = () => view()?.activeRoutes ?? [];
  const criticalContainers = () => view()?.summary?.metrics?.criticalContainers ?? 0;
  const atRiskContainers = () => view()?.summary?.metrics?.atRiskContainers ?? 0;
  const driversOnShift = () => view()?.summary?.fleet?.driversOnShift ?? 0;
  const lastOptimization = () => view()?.lastOptimization ?? null;
  const criticalList = () => view()?.summary?.criticalContainerList ?? [];

  return (
    <section className="space-y-4" data-testid="planner-overview">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-xl font-bold text-text-primary dark:text-white">Resumen Operativo</h2>
        <Button variant="outline" size="sm" className="gap-2" icon={<FileBarChart className="w-4 h-4" />}>
          Ver reportes
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Residuos recolectados hoy"
          value="0.00"
          unit="toneladas"
          icon={<Trash2Icon className="w-6 h-6" />}
          iconTone="green"
          trend={{ value: 0 }}
          trendLabel="vs ayer"
        />
        <KpiCard
          title="Rutas completadas"
          value="0 de 0"
          icon={<Route className="w-6 h-6" />}
          iconTone="green"
          footer={
            <ProgressBar value={0} max={1} color="green" size="sm" />
          }
        />
        <KpiCard
          title="Vehículos activos"
          value="0 de 0"
          icon={<Truck className="w-6 h-6" />}
          iconTone="blue"
        />
        <KpiCard
          title="Alertas activas"
          value="0 alertas"
          icon={<AlertTriangle className="w-6 h-6" />}
          iconTone="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
        <MetricCard
          label="Contenedores críticos"
          value={0}
          status="critical"
          action={{ label: 'Revisar', href: '/collection-points?status=critico' }}
        />
        <MetricCard
          label="En riesgo de rebose"
          value={0}
          status="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-default bg-surface p-4">
          <h3 className="font-semibold text-text-primary dark:text-white mb-3">Última optimización</h3>
          <p className="text-sm text-text-secondary">Sin optimizaciones recientes</p>
        </div>
        <div className="rounded-xl border border-default bg-surface p-4">
          <h3 className="font-semibold text-text-primary dark:text-white mb-3">Conductores en turno</h3>
          <p className="text-sm text-text-secondary">0 conductores activos</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Accesos rápidos</span>
        <a href="/map"><button className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover dark:bg-dark-surface-hover dark:border-dark-border" type="button"><Map className="w-4 h-4" /> Mapa GIS</button></a>
        <a href="/reports"><button className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover dark:bg-dark-surface-hover dark:border-dark-border" type="button"><FileBarChart className="w-4 h-4" /> Reportes</button></a>
        <a href="/planning/history"><button className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover dark:bg-dark-surface-hover dark:border-dark-border" type="button"><History className="w-4 h-4" /> Historial</button></a>
      </div>
    </section>
  );
}

function PlannerActionSection() {
  return (
    <div className="rounded-xl border border-default bg-surface p-4">
      <h3 className="font-semibold text-text-primary dark:text-white mb-3">Acciones de planificación</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button variant="primary" className="gap-2 h-14" icon={<Zap className="w-5 h-5" />}>
          Nueva optimización IA
        </Button>
        <Button variant="outline" className="gap-2 h-14" icon={<Map className="w-4 h-4" />}>
          Ver monitoreo en vivo
        </Button>
        <Button variant="outline" className="gap-2 h-14" icon={<FileBarChart className="w-4 h-4" />}>
          Generar reporte
        </Button>
        <Button variant="outline" className="gap-2 h-14" icon={<History className="w-4 h-4" />}>
          Ver historial
        </Button>
      </div>
    </div>
  );
}