import { Show, createMemo, createResource } from 'solid-js';
import { Download, FileSpreadsheet, FileText } from 'lucide-solid';
import { Button } from '../../design-system/components';
import {
  downloadSimulationExport,
  downloadSimulationRoutesGeoJSON,
  fetchSimulationComparisons,
} from '../../core/api/simulation';

interface SimulationRunComparisonCardProps {
  simulationId: number | null;
}

export function SimulationRunComparisonCard(props: SimulationRunComparisonCardProps) {
  const [comparisons] = createResource(
    () => (props.simulationId != null ? fetchSimulationComparisons({}) : Promise.resolve([])),
  );
  const view = createMemo(() => {
    const run = (comparisons() ?? []).find((item) => item.id === props.simulationId);
    if (!run) return null;
    return {
      ...run,
      dateLabel: run.date ?? run.executedAt ?? '—',
      durationLabel:
        run.durationHoursOptimized != null ? `${run.durationHoursOptimized.toFixed(1)} h` : '—',
      co2Label: run.co2KgAvoided != null ? `${run.co2KgAvoided.toFixed(1)} kg CO₂ evitado` : '—',
    };
  });

  return (
    <Show when={props.simulationId} fallback={null}>
      {(id) => (
        <Show
          when={view()}
          fallback={
            <div class="rounded-xl border border-border bg-elevated/50 px-4 py-3 dark:border-dark-border">
              <p class="text-sm text-text-secondary">
                Contexto de simulación #{id()}. Los datos agregados de esta página no forman parte
                del guion de defensa; usa Reportes o la pestaña Historial de Simulación.
              </p>
            </div>
          }
        >
          {(item) => (
            <div class="rounded-xl border border-fero-green/30 bg-fero-green/10 px-4 py-3 dark:border-fero-green/20 dark:bg-fero-green/5">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-fero-green-dark dark:text-fero-green-mid">
                    Corrida #{id()} — {item().label}
                  </p>
                  <p class="mt-0.5 text-xs text-text-muted">
                    Ejecutada el {item().dateLabel} · resultados reales de la optimización (no
                    agregados)
                  </p>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    icon={<FileSpreadsheet size={13} />}
                    onClick={() => void downloadSimulationExport('csv', id())}
                  >
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    icon={<FileText size={13} />}
                    onClick={() => void downloadSimulationExport('pdf', id())}
                  >
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5"
                    icon={<Download size={13} />}
                    onClick={() => void downloadSimulationRoutesGeoJSON(id())}
                  >
                    GeoJSON
                  </Button>
                </div>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-text-muted">Distancia IA</p>
                  <p class="text-lg font-bold text-text-primary dark:text-white">
                    {item().distanceOptimizedKm.toFixed(1)} km
                    <span class="ml-1 text-xs font-medium text-text-muted">
                      (antes {item().distanceHistoricalKm.toFixed(1)})
                    </span>
                  </p>
                </div>
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-text-muted">Ahorro</p>
                  <p class="text-lg font-bold text-fero-green-dark dark:text-fero-green-mid">
                    {item().savingPct.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-text-muted">Duración IA / CO₂</p>
                  <p class="text-lg font-bold text-text-primary dark:text-white">
                    {item().durationLabel}
                    <span class="ml-1 text-xs font-medium text-text-muted">· {item().co2Label}</span>
                  </p>
                </div>
              </div>
              <p class="mt-2 text-[11px] text-text-muted">
                Nota metodológica: la ruta "actual/histórica" es la línea base sintética (orden por
                código); la "IA" es la optimizada por ACO de esta corrida.
              </p>
            </div>
          )}
        </Show>
      )}
    </Show>
  );
}
