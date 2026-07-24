import { LayoutDashboard, TrendingUp, Truck, AlertTriangle } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card } from '../../design-system/components';
import { KpiCard } from '../../design-system/components';

export default function DashboardPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Resumen de KPIs, estado de la flota y puntos críticos"
      />

      <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Vehículos activos" value="3" unit="/ 5" icon={<Truck size={20} />} />
        <KpiCard title="Rutas hoy" value="12" icon={<LayoutDashboard size={20} />} />
        <KpiCard title="Eficiencia" value="87" unit="%" trend={{ value: 4, direction: 'up' }} icon={<TrendingUp size={20} />} />
        <KpiCard title="Alertas críticas" value="2" icon={<AlertTriangle size={20} />} />
      </div>

      <div class="grid gap-4" style={{ 'grid-template-columns': '70% 30%' }}>
        <Card class="min-h-[400px] flex items-center justify-center">
          <div class="text-center text-text-muted">
            <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fero-blue/10">
              <LayoutDashboard size={24} class="text-fero-blue" />
            </div>
            <p class="font-heading font-semibold text-text-primary dark:text-white">Mapa del Dashboard</p>
            <p class="text-sm mt-1">Vista general del mapa con rutas activas</p>
          </div>
        </Card>
        <div class="space-y-4">
          <Card class="min-h-[190px] flex items-center justify-center">
            <div class="text-center text-text-muted">
              <p class="font-heading font-semibold text-sm text-text-primary dark:text-white">Estado de Vehículos</p>
              <p class="text-xs mt-1">Disponible · En ruta · Mantenimiento</p>
            </div>
          </Card>
          <Card class="min-h-[190px] flex items-center justify-center">
            <div class="text-center text-text-muted">
              <p class="font-heading font-semibold text-sm text-text-primary dark:text-white">Puntos Críticos</p>
              <p class="text-xs mt-1">Contenedores con nivel ≥ 80%</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
