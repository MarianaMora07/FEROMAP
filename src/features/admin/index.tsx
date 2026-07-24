import { Settings } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card, CardHeader } from '../../design-system/components';

export default function AdminPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Administración"
        subtitle="Gestión de usuarios, roles y configuración del sistema"
      />

      <div class="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Usuarios" subtitle="Administrar cuentas" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <Settings size={24} class="mx-auto mb-2 text-fero-blue" />
            <p class="text-sm">Listado de usuarios del sistema</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Roles y Permisos" subtitle="Control de acceso" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <Settings size={24} class="mx-auto mb-2 text-fero-green-dark" />
            <p class="text-sm">Roles: Admin, Operador, Supervisor</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Configuración" subtitle="Parámetros globales" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <Settings size={24} class="mx-auto mb-2 text-text-muted" />
            <p class="text-sm">Configuración general del sistema</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
