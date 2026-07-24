import { Map, Route } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card, CardHeader } from '../../design-system/components';
import { Button } from '../../design-system/components';

export default function OptimizationPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Optimización de Rutas"
        subtitle="Configurar y ejecutar optimización VRP con IA"
        action={<Button variant="primary" icon={<Route size={16} />}>Nueva optimización</Button>}
      />

      <div class="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Formulario de Optimización" subtitle="Parámetros y restricciones" />
          <div class="space-y-4">
            <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
              <Map size={24} class="mx-auto mb-2 text-fero-blue" />
              <p class="text-sm">Formulario de configuración de rutas</p>
              <p class="text-xs mt-1">Selección de vehículos, sectores, restricciones</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Comparación de Rutas" subtitle="Ruta actual vs. optimizada" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <Route size={24} class="mx-auto mb-2 text-fero-green-dark" />
            <p class="text-sm">Vista comparativa de rutas</p>
            <p class="text-xs mt-1">Distancia, tiempo, combustible, emisiones</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
