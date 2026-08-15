import { Show, createEffect, onCleanup, onMount, type JSX } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { OptimizationAdminCyclePanel } from './OptimizationAdminCyclePanel';
import { OptimizationDeskIntro } from './OptimizationDeskIntro';
import { OptimizationPendingSection } from './OptimizationPendingSection';
import type { DailyPlan, PendingVisit } from '../../core/api/planning';

interface OptimizationMoreContextPanelProps {
  selectedDate: string;
  dailyPlan?: DailyPlan | null;
  weeklyPlanApproved: boolean;
  scenarioLabel?: string;
  pendingCount: number;
  scheduledCount: number;
  totalCount: number;
  pendingPoints: PendingVisit[];
  loading?: boolean;
  pdfDisabled?: boolean;
  onRefreshPending: () => void;
  onCloseDay: () => void;
  onDownloadPdf: () => void;
  noWeeklyApprovedSlot?: JSX.Element;
}

export function OptimizationMoreContextPanel(props: OptimizationMoreContextPanelProps) {
  let detailsRef: HTMLDetailsElement | undefined;

  const applyHashOpen = () => {
    if (!detailsRef || typeof window === 'undefined') return;
    if (window.location.hash === '#pendientes') {
      detailsRef.open = true;
    }
  };

  onMount(() => {
    applyHashOpen();
    const onHashChange = () => applyHashOpen();
    window.addEventListener('hashchange', onHashChange);
    onCleanup(() => window.removeEventListener('hashchange', onHashChange));
  });

  createEffect(() => {
    props.operationDate;
    applyHashOpen();
  });

  return (
    <details
      ref={detailsRef}
      class="group rounded-xl border border-default bg-surface/40"
      data-testid="optimization-more-context"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none">
        <span class="text-sm font-semibold text-text-primary">
          Más contexto
          <span class="ml-2 font-normal text-text-muted">
            pendientes · admin
          </span>
        </span>
        <ChevronDown
          size={16}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div class="space-y-4 border-t border-default px-4 pb-4 pt-3">
        <OptimizationDeskIntro
          selectedDate={props.selectedDate}
          dailyPlan={props.dailyPlan}
          weeklyPlanApproved={props.weeklyPlanApproved}
          scenarioLabel={props.scenarioLabel}
          pendingCount={props.pendingCount}
          scheduledCount={props.scheduledCount}
          totalCount={props.totalCount}
          pendingPoints={props.pendingPoints}
          loading={props.loading}
          pdfDisabled={props.pdfDisabled}
          onRefreshPending={props.onRefreshPending}
          onCloseDay={props.onCloseDay}
          onDownloadPdf={props.onDownloadPdf}
        />

        <Show when={props.noWeeklyApprovedSlot}>{props.noWeeklyApprovedSlot}</Show>

        <OptimizationPendingSection
          operationDate={props.selectedDate}
          openPendingCount={props.pendingCount}
        />

        <OptimizationAdminCyclePanel />
      </div>
    </details>
  );
}
