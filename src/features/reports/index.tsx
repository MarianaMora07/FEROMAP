import { FileText, Download } from 'lucide-solid';
import { PageHeader } from '../../design-system/layout/AppShell';
import { Card } from '../../design-system/components';
import { Button } from '../../design-system/components';

export default function ReportsPage() {
  return (
    <div class="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle="Exportar datos en PDF, Excel o CSV"
      />

      <div class="grid gap-4 sm:grid-cols-3">
        <Card hover class="flex flex-col items-center p-6 text-center">
          <div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
            <FileText size={24} class="text-red-500" />
          </div>
          <p class="font-heading font-semibold text-text-primary dark:text-white">PDF</p>
          <p class="text-xs text-text-muted mt-1 mb-4">Reportes formateados con gráficos</p>
          <Button variant="outline" size="sm" icon={<Download size={14} />}>Exportar PDF</Button>
        </Card>

        <Card hover class="flex flex-col items-center p-6 text-center">
          <div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
            <FileText size={24} class="text-emerald-600" />
          </div>
          <p class="font-heading font-semibold text-text-primary dark:text-white">Excel</p>
          <p class="text-xs text-text-muted mt-1 mb-4">Hojas de cálculo con datos crudos</p>
          <Button variant="outline" size="sm" icon={<Download size={14} />}>Exportar Excel</Button>
        </Card>

        <Card hover class="flex flex-col items-center p-6 text-center">
          <div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-fero-blue/10">
            <FileText size={24} class="text-fero-blue" />
          </div>
          <p class="font-heading font-semibold text-text-primary dark:text-white">CSV</p>
          <p class="text-xs text-text-muted mt-1 mb-4">Datos tabulares para análisis externo</p>
          <Button variant="outline" size="sm" icon={<Download size={14} />}>Exportar CSV</Button>
        </Card>
      </div>
    </div>
  );
}
