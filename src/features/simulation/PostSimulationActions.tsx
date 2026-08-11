import { A } from '@solidjs/router';
import { BarChart3, Download, FileSpreadsheet, FileText, Map, Plus, Route } from 'lucide-solid';
import { Button } from '../../design-system/components';
import { downloadReport } from '../../core/api/reports';
import { analyticsHref, reportsHref } from '../../core/utils/simulationLinks';

interface PostSimulationActionsProps {
  simulationId: number | null;
  onNewSimulation: () => void;
  compact?: boolean;
}

export function PostSimulationActions(props: PostSimulationActionsProps) {
  const analyticsLink = () => analyticsHref(props.simulationId);
  const reportsLink = () => reportsHref(props.simulationId);

  return (
    <div
      class={`rounded-xl border border-fero-green/30 bg-fero-green/5 p-4 dark:border-fero-green/20 ${
        props.compact ? '' : 'space-y-3'
      }`}
    >
      {!props.compact && (
        <div>
          <p class="text-sm font-semibold text-text-primary dark:text-white">¿Qué quieres hacer ahora?</p>
          <p class="mt-0.5 text-xs text-text-muted">
            Continúa el análisis sin salir del flujo de evaluación de escenarios.
          </p>
        </div>
      )}
      <div class="flex flex-wrap gap-2">
        <A href="/map">
          <Button variant="outline" size="sm" class="gap-2" icon={<Map size={16} />}>
            Ver en mapa
          </Button>
        </A>
        <A href={analyticsLink()}>
          <Button variant="outline" size="sm" class="gap-2" icon={<BarChart3 size={16} />}>
            Ver en analítica
          </Button>
        </A>
        <A href={reportsLink()}>
          <Button variant="outline" size="sm" class="gap-2" icon={<FileText size={16} />}>
            Ir a reportes
          </Button>
        </A>
        <Button
          variant="outline"
          size="sm"
          class="gap-2"
          icon={<FileSpreadsheet size={16} />}
          onClick={() => void downloadReport('csv')}
        >
          Descargar CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-2"
          icon={<Download size={16} />}
          onClick={() => void downloadReport('pdf')}
        >
          Descargar PDF
        </Button>
        <Button variant="outline" size="sm" class="gap-2" icon={<Plus size={16} />} onClick={props.onNewSimulation}>
          Nueva simulación
        </Button>
        <A href="/optimization">
          <Button variant="outline" size="sm" class="gap-2" icon={<Route size={16} />}>
            Despachar en planificación operativa
          </Button>
        </A>
      </div>
    </div>
  );
}
