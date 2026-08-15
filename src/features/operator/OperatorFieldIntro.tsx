import { For } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { getOperatorQuickActions } from '../../core/operator/operatorHubUx';

export function OperatorFieldIntro() {
  const operationDate = () => new Date().toISOString().slice(0, 10);
  const quickActions = () => getOperatorQuickActions({ date: operationDate() });

  return (
    <div
      class="flex flex-col gap-2 rounded-lg border border-default bg-surface/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      data-testid="operator-field-intro"
    >
      <p class="text-sm text-text-secondary">
        Jornada en campo — ejecuta tu ruta, reporta incidencias y consulta el avance.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <For each={quickActions().filter((item) => item.id !== 'breakdown')}>
          {(item) => (
            <A
              href={item.href}
              class="inline-flex items-center gap-1 text-sm font-medium text-fero-blue hover:underline"
            >
              {item.label}
              <ArrowRight size={14} aria-hidden="true" />
            </A>
          )}
        </For>
      </div>
    </div>
  );
}
