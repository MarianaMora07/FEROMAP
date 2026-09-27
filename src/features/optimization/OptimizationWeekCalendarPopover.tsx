import { Show, createSignal, onCleanup } from 'solid-js';
import { OptimizationWeekCalendar } from './OptimizationWeekCalendar';

interface OptimizationWeekCalendarPopoverProps {
  selectedDate: string;
  summaryLabel: string;
  onDateSelect: (date: string) => void;
}

export function OptimizationWeekCalendarPopover(props: OptimizationWeekCalendarPopoverProps) {
  const [open, setOpen] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  const close = () => setOpen(false);

  const handleDateSelect = (date: string) => {
    props.onDateSelect(date);
    close();
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (!open() || !rootRef) return;
    if (!rootRef.contains(event.target as Node)) {
      close();
    }
  };

  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next) {
      document.addEventListener('mousedown', handleDocumentClick);
    } else {
      document.removeEventListener('mousedown', handleDocumentClick);
    }
  };

  onCleanup(() => document.removeEventListener('mousedown', handleDocumentClick));

  return (
    <div ref={rootRef} class="relative min-w-0">
      <button
        type="button"
        class="max-w-full truncate rounded-md px-2 py-1 text-left text-sm font-semibold text-text-primary hover:bg-app"
        data-testid="optimization-date-trigger"
        onClick={toggle}
      >
        {props.summaryLabel}
      </button>
      <Show when={open()}>
        <div
          class="absolute left-0 top-full z-50 mt-1 w-[min(100vw-2rem,22rem)] rounded-xl border border-default bg-elevated p-2 shadow-lg"
          data-testid="optimization-week-calendar-popover"
        >
          <OptimizationWeekCalendar
            selectedDate={props.selectedDate}
            onDateSelect={handleDateSelect}
            variant="popover"
          />
        </div>
      </Show>
    </div>
  );
}
