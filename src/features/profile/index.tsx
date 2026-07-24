import { User } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card, CardHeader } from '../../design-system/components';
import { Button } from '../../design-system/components';

export default function ProfilePage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Mi Perfil"
        subtitle="Configuración de cuenta y preferencias"
        action={<Button variant="primary" size="sm">Guardar cambios</Button>}
      />

      <div class="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Información Personal" subtitle="Datos de la cuenta" />
          <div class="space-y-4">
            <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
              <div class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-fero-blue/10">
                <User size={28} class="text-fero-blue" />
              </div>
              <p class="font-heading font-semibold text-text-primary dark:text-white">Nombre del Usuario</p>
              <p class="text-xs text-text-muted mt-1">admin@feromap.com</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Preferencias" subtitle="Tema, idioma y notificaciones" />
          <div class="rounded-[var(--radius-md)] border border-dashed border-border p-8 text-center text-text-muted">
            <p class="text-sm">Configuración de tema, idioma y preferencias de notificación</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
