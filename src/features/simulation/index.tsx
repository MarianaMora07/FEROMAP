import { Brain, Play } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card, CardHeader } from '../../design-system/components';
import { Button } from '../../design-system/components';

export default function SimulationPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Simulación"
        subtitle="Seleccionar escenario y ejecutar optimización con IA"
        action={<Button variant="primary" icon={<Play size={16} />}>Ejecutar simulación</Button>}
      />

      <div class="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Selección de Escenario" subtitle="Configurar parámetros de simulación" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <Brain size={24} class="mx-auto mb-2 text-fero-blue" />
            <p class="text-sm">Selector de escenarios (tráfico, clima, demanda)</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Optimización con IA" subtitle="Motor VRP + ACO" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <Play size={24} class="mx-auto mb-2 text-fero-green-dark" />
            <p class="text-sm">Panel de ejecución y progreso</p>
            <p class="text-xs mt-1">Log de eventos del motor de optimización</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
