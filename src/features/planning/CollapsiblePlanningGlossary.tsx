import { ChevronDown } from 'lucide-solid';
import { createSignal, onMount } from 'solid-js';
import { PlanningGlossaryStrip } from './PlanningGlossaryStrip';

const STORAGE_KEY = 'feromap.weekly.glossary.collapsed';

export function CollapsiblePlanningGlossary() {
  const [open, setOpen] = createSignal(false);

  onMount(() => {
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) !== 'true');
    } catch {
      setOpen(true);
    }
  });

  const handleToggle = (nextOpen: boolean) => {
    setOpen(nextOpen);
    try {
      localStorage.setItem(STORAGE_KEY, nextOpen ? 'false' : 'true');
    } catch {
      // ignore
    }
  };

  return (
    <details
      class="group rounded-xl border border-border bg-surface/40 dark:border-dark-border"
      open={open()}
      onToggle={(event) => handleToggle((event.currentTarget as HTMLDetailsElement).open)}
      data-testid="weekly-plan-glossary"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 marker:content-none">
        <span class="text-sm font-medium text-text-secondary">
          Niveles de planificación
          <span class="ml-2 text-xs font-normal text-text-muted">Directivo · Administrativo · Operativo</span>
        </span>
        <ChevronDown
          size={16}
          class="shrink-0 text-text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div class="border-t border-border px-4 pb-4 pt-3 dark:border-dark-border">
        <PlanningGlossaryStrip />
      </div>
    </details>
  );
}
