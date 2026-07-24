import { AlertTriangle } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card } from '../../design-system/components';
import { Badge } from '../../design-system/components';

const mockAlerts = [
  { id: 1, title: 'Contenedor CR-04 al 95%', type: 'danger', time: 'Hace 5 min', sector: 'Norte' },
  { id: 2, title: 'Vehículo V-003 sin GPS', type: 'warning', time: 'Hace 12 min', sector: '—' },
  { id: 3, title: 'Ruta 7 retrasada 20 min', type: 'info', time: 'Hace 18 min', sector: 'Sur' },
];

const typeMap: Record<string, { variant: 'danger' | 'warning' | 'info'; label: string }> = {
  danger: { variant: 'danger', label: 'Crítico' },
  warning: { variant: 'warning', label: 'Advertencia' },
  info: { variant: 'info', label: 'Informativo' },
};

export default function AlertsPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Alertas"
        subtitle="Notificaciones del sistema y filtros por severidad"
      />

      <div class="flex gap-2 mb-2">
        <Badge variant="danger" size="md" dot>Todas</Badge>
        <Badge variant="outline" size="md">Críticas</Badge>
        <Badge variant="outline" size="md">Advertencias</Badge>
        <Badge variant="outline" size="md">Informativas</Badge>
      </div>

      <div class="space-y-3">
        {mockAlerts.map((alert) => {
          const t = typeMap[alert.type] ?? typeMap.info;
          return (
            <Card hover class="flex items-center gap-4">
              <div class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                t.variant === 'danger' ? 'bg-red-50 dark:bg-red-900/20' :
                t.variant === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20' :
                'bg-fero-blue/10'
              }`}>
                <AlertTriangle size={18} class={
                  t.variant === 'danger' ? 'text-red-500' :
                  t.variant === 'warning' ? 'text-amber-500' :
                  'text-fero-blue'
                } />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-heading font-semibold text-sm text-text-primary dark:text-white">{alert.title}</p>
                <p class="text-xs text-text-muted">{alert.sector} · {alert.time}</p>
              </div>
              <Badge variant={t.variant} dot>{t.label}</Badge>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
