import { ChevronDown, FileText, GitCompare } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { Button, TextField } from '../../design-system/components';
import type { PlanVersion } from '../../core/api/planning';

interface WeeklyPlanHistoryExportPanelProps {
  planId?: number;
  versions: PlanVersion[];
  versionDiff: Array<{ path: string; before: unknown; after: unknown }>;
  compareA: string;
  compareB: string;
  onCompareAChange: (value: string) => void;
  onCompareBChange: (value: string) => void;
  onLoadVersions: () => void;
  onCompareVersions: () => void;
  onShowLatestChanges: () => void;
  onExportPdf: () => void;
}

export function WeeklyPlanHistoryExportPanel(props: WeeklyPlanHistoryExportPanelProps) {
  return (
    <details
      class="group rounded-xl border border-border bg-surface/40 dark:border-dark-border"
      data-testid="weekly-plan-history-export"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none">
        <span class="text-sm font-semibold text-text-primary dark:text-white">
          Historial y exportación
          <span class="ml-2 font-normal text-text-muted">versiones · PDF · cambios</span>
        </span>
        <ChevronDown
          size={16}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div class="space-y-3 border-t border-border px-4 pb-4 pt-3 dark:border-dark-border">
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => props.onLoadVersions()}>
            Ver versiones
          </Button>
          <Button variant="outline" size="sm" onClick={() => props.onShowLatestChanges()}>
            <GitCompare size={14} class="mr-1.5" />
            Ver qué cambió
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!props.planId}
            onClick={() => props.onExportPdf()}
          >
            <FileText size={14} class="mr-1.5" />
            Exportar PDF
          </Button>
        </div>

        <Show when={props.versions.length > 0}>
          <ul class="space-y-1 text-sm text-text-secondary">
            <For each={props.versions}>
              {(version) => (
                <li>
                  v{version.versionNumber} — {version.changeSummary ?? 'Sin descripción'} (
                  {version.createdAt ?? '—'})
                </li>
              )}
            </For>
          </ul>
          <div class="grid gap-2 md:grid-cols-3">
            <TextField label="Versión A" value={props.compareA} onInput={(e) => props.onCompareAChange(e.currentTarget.value)} />
            <TextField label="Versión B" value={props.compareB} onInput={(e) => props.onCompareBChange(e.currentTarget.value)} />
            <div class="flex items-end">
              <Button variant="outline" size="sm" onClick={() => props.onCompareVersions()}>
                Comparar
              </Button>
            </div>
          </div>
          <Show when={props.versionDiff.length > 0}>
            <ul class="space-y-1 text-xs text-text-muted">
              <For each={props.versionDiff.slice(0, 12)}>
                {(change) => (
                  <li>
                    {change.path}: {JSON.stringify(change.before)} → {JSON.stringify(change.after)}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </details>
  );
}
