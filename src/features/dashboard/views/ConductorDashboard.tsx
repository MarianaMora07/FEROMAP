import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { ArrowRight, AlertTriangle, Clock, Download, Leaf, Route, Trash2, Truck, MapPin, CheckCircle, XCircle, Map, Package, CheckCircle2, Bell, Shield, ShieldCheck, CalendarDays, Recycle } from 'lucide-solid';
import { Button, Card, CardHeader, KpiCard, ProgressBar, Badge } from '../../design-system/components';
import { fetchDashboardSummary, fetchDashboardAnalytics } from '../../core/api/dashboard';
import { SparklineKpiCard, MetricCard, LineChart, BarChart, DoughnutChart, ChartCard } from '../components';
import { globalToast } from '../../core/stores/toastStore';
import { RouteProgressSection } from './RouteProgressSection';

export function ConductorDashboard() {
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);
  const [summary, setSummary] = createSignal<any>(null);
  const [analytics, setAnalytics] = createSignal<any>(null);

  const loadData = async () => {
    try {
      const [summaryData, analyticsData] = await Promise.all([
        fetchDashboardSummary(),
        fetchDashboardAnalytics({ granularity: 'daily' }),
      ]);
      setSummary(summaryData);
      setAnalytics(analyticsData);
    } catch (e) {
      console.error('Error loading conductor dashboard:', e);
    }
  };

  return (
    <div className="space-y-4 md:space-y-5" data-testid="conductor-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-text-primary dark:text-white">Mi Ruta de Hoy</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Progreso, paradas y estado de tu jornada
          </p>
        </div>
      </div>

      <RouteStatusCard />
      <RouteProgressSection />
      <StopsListSection />
      <ContainersAssignedSection />
      <VehicleInfoCard />
    </div>
  );
}

function RouteStatusCard() {
  return (
    <div className="rounded-xl border border-default bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text-primary dark:text-white">Estado de la ruta</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-fero-green/10 border border-fero-green/30 px-3 py-1 text-sm font-medium text-fero-green-dark">
            <span className="h-2 w-2 rounded-full bg-fero-green animate-pulse" />
            En progreso
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Paradas de hoy"
          value="24/32"
          icon={<Package className="w-6 h-6" />}
          iconTone="green"
          value="24/32"
        />
        <KpiCard
          title="Avance de ruta"
          value="75%"
          icon={<CheckCircle2 className="w-6 h-6" />}
          iconTone="blue"
          value="75%"
          footer={<ProgressBar value={75} max={100} color="blue" size="sm" />}
        />
        <KpiCard
          title="Pendientes"
          value="8"
          unit="paradas"
          icon={<AlertTriangle className="w-6 h-6" />}
          iconTone="amber"
          value="8"
          unit="paradas"
        />
      </div>
    </div>
  );
}