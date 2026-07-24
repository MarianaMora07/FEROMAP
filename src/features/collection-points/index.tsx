import { Trash2 } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card } from '../../design-system/components';

export default function CollectionPointsPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Puntos de Recolección"
        subtitle="Mapa y tabla de contenedores y puntos de acopio"
      />

      <div class="grid gap-6 lg:grid-cols-2">
        <Card class="min-h-[350px] flex items-center justify-center">
          <div class="text-center text-text-muted">
            <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fero-green/10">
              <Trash2 size={24} class="text-fero-green-dark" />
            </div>
            <p class="font-heading font-semibold text-text-primary dark:text-white">Mapa de Puntos</p>
            <p class="text-sm mt-1">Ubicación geográfica de todos los contenedores</p>
          </div>
        </Card>

        <Card class="min-h-[350px] flex items-center justify-center">
          <div class="text-center text-text-muted">
            <p class="font-heading font-semibold text-text-primary dark:text-white">Tabla de Puntos</p>
            <p class="text-sm mt-1">Listado con nivel de llenado, sector y estado</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
