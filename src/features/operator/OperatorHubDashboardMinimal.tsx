import { For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { Button, Card, LoadingPanel } from '../../design-system/components';
import type { OperatorFieldContext } from '../../core/operator/operatorUx';
import type { OperatorNextAction, OperatorQuickAction } from '../../core/operator/operatorHubUx';
import { operatorRouteStatusLabel } from '../../core/operator/operatorHubUx';
import { OperatorJourneyStrip } from './OperatorJourneyStrip';

const toneClass = {
  warning: 'border-amber-300/60 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  info: 'border-fero-blue/30 bg-fero-blue/10',
  success: 'border-fero-green/40 bg-fero-green/10',
} as const;

const quickActionIcons = {
  monitoring: 'Monitoreo',
  map: 'Mapa',
  alerts: 'Alertas',
  breakdown: 'Avería',
} as const;

interface OperatorHubDashboardMinimalProps {
  loading: boolean;
  context: OperatorFieldContext;
  nextAction: OperatorNextAction;
  quickActions: OperatorQuickAction[];
  showJourney: boolean;
}

export function OperatorHubDashboardMinimal(props: OperatorHubDashboardMinimalProps) {
  return (
    <section class="space-y-3" data-testid="operator-hub">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-heading text-lg font-bold text-text-primary dark:text-white">Mi operación</h2>
        <A href="/operator" class="text-sm font-medium text-fero-blue hover:underline">
          Ver hub completo
        </A>
      </div>

      <Show when={props.loading}>
        <Card>
          <LoadingPanel label="Cargando tu jornada…" indeterminate />
        </Card>
      </Show>

      <Show when={!props.loading}>
        <Card padding={false} class="overflow-hidden">
          <div class={`border-b border-default px-4 py-4 ${toneClass[props.nextAction.tone]}`}>
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Qué hacer ahora</p>
            <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-base font-semibold text-text-primary">{props.nextAction.message}</p>
              <A href={props.nextAction.href} class="shrink-0">
                <Button
                  variant={props.nextAction.tone === 'warning' ? 'primary' : 'gradient'}
                  size="lg"
                  class="w-full gap-2 sm:w-auto"
                  data-testid="operator-next-action"
                >
                  {props.nextAction.label}
                  <ArrowRight size={16} />
                </Button>
              </A>
            </div>
          </div>

          <Show when={props.showJourney}>
            <div class="px-4 py-3">
              <OperatorJourneyStrip
                operationDate={props.context.operationDate}
                vehicleId={props.context.vehicle?.id}
                routeLabel={props.context.vehicle?.route}
                statusLabel={operatorRouteStatusLabel(props.context)}
                planStatus={props.context.planStatus}
                progress={props.context.vehicle?.progress ?? 0}
                nextPoint={props.context.vehicle?.nextPoint}
              />
            </div>
          </Show>
        </Card>

        <div class="flex flex-wrap gap-2" data-testid="operator-quick-actions">
          <For each={props.quickActions}>
            {(item) => (
              <A href={item.href}>
                <Button variant="outline" size="sm">
                  {quickActionIcons[item.id]}
                </Button>
              </A>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
