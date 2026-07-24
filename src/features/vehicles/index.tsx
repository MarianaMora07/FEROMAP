import { Truck } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card } from '../../design-system/components';
import { Button } from '../../design-system/components';
import { Badge } from '../../design-system/components';

const mockVehicles = [
  { id: 'V-001', name: 'Camión Alpha', status: 'activo', capacity: '8 m³', fuel: '72%', driver: 'Carlos Méndez' },
  { id: 'V-002', name: 'Camión Beta', status: 'en-ruta', capacity: '6 m³', fuel: '45%', driver: 'Luis Ramírez' },
  { id: 'V-003', name: 'Camión Gamma', status: 'mantenimiento', capacity: '10 m³', fuel: '90%', driver: '—' },
];

const statusMap: Record<string, { variant: 'success' | 'info' | 'warning' | 'default'; label: string }> = {
  activo: { variant: 'success', label: 'Activo' },
  'en-ruta': { variant: 'info', label: 'En ruta' },
  mantenimiento: { variant: 'warning', label: 'Mantenimiento' },
  inactivo: { variant: 'default', label: 'Inactivo' },
};

export default function VehiclesPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Gestión de Vehículos"
        subtitle="Flota, estado, capacidad, combustible y conductor"
        action={<Button variant="primary" icon={<Truck size={16} />}>Agregar vehículo</Button>}
      />

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockVehicles.map((v) => {
          const s = statusMap[v.status] ?? statusMap.inactivo;
          return (
            <Card hover>
              <div class="flex items-start justify-between mb-3">
                <div>
                  <p class="font-heading font-semibold text-text-primary dark:text-white">{v.name}</p>
                  <p class="text-xs text-text-muted">{v.id}</p>
                </div>
                <Badge variant={s.variant} dot>{s.label}</Badge>
              </div>
              <div class="space-y-2 text-sm text-text-secondary">
                <div class="flex justify-between"><span>Capacidad</span><span class="font-medium text-text-primary dark:text-white">{v.capacity}</span></div>
                <div class="flex justify-between"><span>Combustible</span><span class="font-medium text-text-primary dark:text-white">{v.fuel}</span></div>
                <div class="flex justify-between"><span>Conductor</span><span class="font-medium text-text-primary dark:text-white">{v.driver}</span></div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
