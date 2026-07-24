import { Radio } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card } from '../../design-system/components';
import { Badge } from '../../design-system/components';

export default function MonitoringPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Monitoreo en Tiempo Real"
        subtitle="Seguimiento en vivo de la flota y estado de rutas"
      />

      <div class="flex items-center gap-3 mb-2">
        <Badge variant="success" dot size="md">En línea</Badge>
        <span class="text-sm text-text-muted">3 vehículos activos · Actualización cada 5s</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <Card class="lg:col-span-2 min-h-[400px] flex items-center justify-center">
          <div class="text-center text-text-muted">
            <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fero-blue/10">
              <Radio size={24} class="text-fero-blue" />
            </div>
            <p class="font-heading font-semibold text-text-primary dark:text-white">Mapa de Monitoreo</p>
            <p class="text-sm mt-1">Posición en vivo de vehículos con GPS</p>
          </div>
        </Card>

        <div class="space-y-4">
          <Card class="min-h-[120px] flex items-center justify-center">
            <div class="text-center text-text-muted">
              <p class="font-heading font-semibold text-sm text-text-primary dark:text-white">Vehículo 1</p>
              <p class="text-xs mt-1">En ruta · 45% combustible</p>
            </div>
          </Card>
          <Card class="min-h-[120px] flex items-center justify-center">
            <div class="text-center text-text-muted">
              <p class="font-heading font-semibold text-sm text-text-primary dark:text-white">Vehículo 2</p>
              <p class="text-xs mt-1">En ruta · 72% combustible</p>
            </div>
          </Card>
          <Card class="min-h-[120px] flex items-center justify-center">
            <div class="text-center text-text-muted">
              <p class="font-heading font-semibold text-sm text-text-primary dark:text-white">Vehículo 3</p>
              <p class="text-xs mt-1">Detenido · 30% combustible</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
