import { A } from '@solidjs/router';
import { ArrowRight } from 'lucide-solid';
import { Show } from 'solid-js';
import { Button } from '../../design-system/components';
import type { WeeklyPlanNextAction } from '../../core/planning/weeklyPlanUx';

const toneClass = {
  warning: 'border-amber-300/60 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/25',
  info: 'border-fero-blue/30 bg-fero-blue/10',
  success: 'border-fero-green/40 bg-fero-green/10',
};

const titleClass = {
  warning: 'text-amber-800 dark:text-amber-200',
  info: 'text-fero-blue',
  success: 'text-fero-green-dark',
};

interface WeeklyPlanNextActionPanelProps {
  action: WeeklyPlanNextAction | null;
  loading?: boolean;
  disablePrimary?: boolean;
  onAutofill: () => void;
  onValidate: () => void;
  onApprove: () => void;
}

export function WeeklyPlanNextActionPanel(props: WeeklyPlanNextActionPanelProps) {
  const action = () => props.action;
  const usePrimaryVariant = () => action()?.tone === 'success' || action()?.tone === 'warning';

  const handlePrimaryClick = () => {
    const current = action();
    if (!current || current.primaryHref) return;
    switch (current.primaryActionId) {
      case 'autofill':
        props.onAutofill();
        break;
      case 'validate':
        props.onValidate();
        break;
      case 'approve':
        props.onApprove();
        break;
      default:
        break;
    }
  };

  return (
    <Show when={action()}>
      {(current) => (
        <div
          class={`rounded-xl border px-4 py-4 ${toneClass[current().tone]}`}
          data-testid="weekly-plan-next-action"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Qué hacer ahora</p>
          <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class={`text-lg font-bold ${titleClass[current().tone]}`}>{current().message}</p>
              <p class="mt-1 text-sm text-text-secondary">{current().detail}</p>
            </div>
            <Show when={current().primaryLabel && (current().primaryHref || current().primaryActionId)}>
              <Show
                when={current().primaryHref}
                fallback={
                  <Button
                    variant={usePrimaryVariant() ? 'primary' : 'outline'}
                    class="gap-2 shrink-0"
                    loading={props.loading}
                    disabled={props.disablePrimary}
                    onClick={handlePrimaryClick}
                    data-testid="weekly-plan-primary-cta"
                  >
                    {current().primaryLabel}
                    <ArrowRight size={14} />
                  </Button>
                }
              >
                <A href={current().primaryHref!}>
                  <Button variant="primary" class="gap-2 shrink-0" data-testid="weekly-plan-primary-cta">
                    {current().primaryLabel}
                    <ArrowRight size={14} />
                  </Button>
                </A>
              </Show>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
}
