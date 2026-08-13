import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Calendar, ChevronDown, ChevronUp, Clock, Truck } from 'lucide-solid';
import { Badge, Button, Card, CardHeader } from '../../design-system/components';
import type { ResidentSchedule } from '../../core/api/resident';
import { RESIDENT_EMPTY_PRESETS } from '../../core/resident/residentEmptyStates';
import { PlanningEmptyState } from '../planning/PlanningEmptyState';

interface ResidentScheduleCardProps {
  sectorName: string;
  schedule: ResidentSchedule;
}

function formatCountdown(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const diff = target - nowMs;
  if (diff <= 0) return null;
  if (diff > 48 * 60 * 60 * 1000) return null;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `Faltan ${hours}h ${mins}m`;
  return `Faltan ${mins} min`;
}

export function ResidentScheduleStrip(props: { sectorName: string; schedule: ResidentSchedule }) {
  return (
    <div
      role="status"
      class="rounded-lg border border-fero-blue/30 bg-fero-blue/5 px-3 py-2.5 dark:border-fero-blue/40 dark:bg-fero-blue/10"
      data-testid="resident-schedule-strip"
    >
      <p class="text-sm font-semibold text-fero-blue">
        Recolección {props.schedule.collectionDays} · {props.schedule.window}
      </p>
      <p class="mt-0.5 text-xs text-text-secondary">
        {props.sectorName} · Próxima recolección: {props.schedule.nextCollection}
      </p>
    </div>
  );
}

export function ResidentScheduleCard(props: ResidentScheduleCardProps) {
  const [calendarOpen, setCalendarOpen] = createSignal(false);
  const [nowMs, setNowMs] = createSignal(Date.now());

  onMount(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    onCleanup(() => window.clearInterval(timer));
  });

  const schedule = () => props.schedule;
  const countdown = createMemo(() => formatCountdown(schedule().nextCollectionAt, nowMs()));

  return (
    <Card id="horario-recoleccion" data-testid="resident-schedule-card">
      <CardHeader title="Horario de recolección" subtitle={props.sectorName} />
      <Show
        when={schedule().hasSchedule}
        fallback={<PlanningEmptyState {...RESIDENT_EMPTY_PRESETS.noWeeklySchedule} compact />}
      >
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <Badge variant={schedule().isCollectionDay ? 'success' : 'default'}>
              {schedule().isCollectionDay ? 'Hoy hay recolección' : 'Hoy no hay recolección'}
            </Badge>
            <Show when={schedule().hasWeeklyPlan}>
              <Badge variant="info">Plan semanal aprobado</Badge>
            </Show>
          </div>

          <ul class="space-y-2 text-sm">
            <li class="flex items-center gap-2 text-text-secondary">
              <Calendar size={15} class="shrink-0 text-fero-blue" />
              {schedule().collectionDays}
            </li>
            <li class="flex items-center gap-2 text-text-secondary">
              <Truck size={15} class="shrink-0 text-fero-green-dark" />
              {schedule().window}
            </li>
          </ul>

          <div class="rounded-lg border border-fero-green/30 bg-fero-green/10 px-3 py-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-fero-green-dark">
              Próxima recolección
            </p>
            <p class="mt-1 text-sm font-bold text-text-primary dark:text-white">
              {schedule().nextCollection}
            </p>
            <Show when={countdown()}>
              <p class="mt-1 flex items-center gap-1.5 text-xs font-medium text-fero-blue">
                <Clock size={13} />
                {countdown()}
              </p>
            </Show>
            <p class="mt-0.5 text-xs text-text-muted">{schedule().frequency}</p>
          </div>

          <div class="rounded-lg border border-border dark:border-dark-border">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-text-primary hover:bg-surface-hover dark:text-white dark:hover:bg-dark-surface-hover"
              aria-expanded={calendarOpen()}
              onClick={() => setCalendarOpen((open) => !open)}
              data-testid="resident-schedule-calendar-toggle"
            >
              Ver calendario del sector
              {calendarOpen() ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <Show when={calendarOpen()}>
              <ul class="space-y-1 border-t border-border px-3 py-2 dark:border-dark-border">
                <For each={schedule().calendar}>
                  {(day) => (
                    <li class="flex items-center gap-2 text-sm text-text-secondary">
                      <Calendar size={14} class="shrink-0 text-fero-blue" />
                      {day.label}
                    </li>
                  )}
                </For>
                <Show when={schedule().calendar.length === 0}>
                  <li class="text-sm text-text-muted">Sin fechas en las próximas semanas.</li>
                </Show>
              </ul>
            </Show>
          </div>

          <Button
            variant="ghost"
            size="sm"
            class="gap-2 px-0 text-fero-blue hover:text-fero-blue"
            onClick={() => setCalendarOpen(true)}
          >
            <Calendar size={14} />
            Ver calendario del sector
          </Button>
        </div>
      </Show>
    </Card>
  );
}
