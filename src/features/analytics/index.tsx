import { BarChart3 } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card, CardHeader } from '../../design-system/components';

export default function AnalyticsPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Analítica"
        subtitle="Gráficos, heatmaps y métricas de rendimiento"
      />

      <div class="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Gráfico de Rendimiento" subtitle="Distancia y tiempo por ruta" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <BarChart3 size={24} class="mx-auto mb-2 text-fero-blue" />
            <p class="text-sm">Gráfico de barras interactivo</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Heatmap de Cobertura" subtitle="Densidad de recolección por zona" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <BarChart3 size={24} class="mx-auto mb-2 text-fero-green-dark" />
            <p class="text-sm">Heatmap geográfico de actividad</p>
          </div>
        </Card>

        <Card class="lg:col-span-2">
          <CardHeader title="Tendencias Semanales" subtitle="Evolución de KPIs en los últimos 7 días" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <BarChart3 size={24} class="mx-auto mb-2 text-fero-blue" />
            <p class="text-sm">Línea temporal de métricas clave</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
