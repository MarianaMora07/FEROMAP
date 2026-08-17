import { For, Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  History,
  Map,
  Radio,
  Route,
} from 'lucide-solid';
import { Button, Card, CardHeader, LoadingPanel, ProgressBar } from '../../design-system/components';
import { fetchPlanningDashboardSnapshot } from '../../core/api/planningAnalytics';
import { PLANNING_EMPTY_PRESETS } from '../../core/planning/planningEmptyStates';
import { deriveNextPlannerAction, PLANNER_QUICK_ACTIONS } from '../../core/planning/plannerHubUx';
import { weeklyPlanHref } from '../../core/planning/weeklyPlanLinks';
import { buildOperationalJourneySteps } from '../../core/planning/operationalFlowUx';
import { PlanningEmptyState } from './PlanningEmptyState';
import { PlanningGlossaryStrip } from './PlanningGlossaryStrip';
import { PlanningStatusBadge } from './PlanningStatusBadge';
import { OperationalFlowStepper } from './OperationalFlowStepper';
import { PlannerHubDashboardMinimal } from './PlannerHubDashboardMinimal';

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

const quickActionIcons = {
  weekly: CalendarDays,
  today: ClipboardList,
  pending: Route,
  history: History,
  monitoring: Radio,
} as const;

interface PlannerHubSectionProps {
  /** Vista compacta para dashboard vs landing completa en /planning */
  variant?: 'dashboard' | 'landing';
}

export function PlannerHubSection(props: PlannerHubSectionProps) {
  const variant = () => props.variant ?? 'dashboard';
  const [snapshot] = createResource(() => fetchPlanningDashboardSnapshot());

  const weekly = () => snapshot()?.weeklyPlan;
  const daily = () => snapshot()?.dailyPlan;
  const nextAction = () => (snapshot() ? deriveNextPlannerAction(snapshot()!) : null);
  const journeySteps = () => {
    const snap = snapshot();
    if (!snap) return [];
    return buildOperationalJourneySteps({
      weeklyPlan: snap.weeklyPlan,
      dailyPlan: snap.dailyPlan,
    });
  };

  return (
    <Show
      when={variant() === 'landing'}
      fallback={
        <PlannerHubDashboardMinimal
          loading={snapshot.loading}
          snapshot={snapshot()}
          nextAction={nextAction()}
          journeySteps={journeySteps()}
        />
      }
    >
      <section class="space-y-4" id="mi-planificacion" data-testid="planner-hub">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-fero-green-dark">Operación diaria</p>
            <h2 class="font-heading text-xl font-bold text-text-primary dark:text-white">Mi planificación</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Punto de entrada operativo — optimización y despacho del día.
            </p>
          </div>
        </div>

        <Show when={snapshot.loading}>
          <Card>
            <LoadingPanel label="Cargando tu planificación…" indeterminate />
          </Card>
        </Show>

        <Show when={!snapshot.loading && nextAction()}>
          {(action) => (
            <div class={`rounded-xl border px-4 py-4 ${toneClass[action().tone]}`}>
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Qué hacer ahora</p>
              <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class={`text-lg font-bold ${titleClass[action().tone]}`}>{action().message}</p>
                  <p class="mt-1 text-sm text-text-secondary">{action().detail}</p>
                </div>
                <A href={action().href}>
                  <Button variant={action().tone === 'warning' ? 'primary' : 'outline'} class="gap-2 shrink-0">
                    {action().label}
                    <ArrowRight size={14} />
                  </Button>
                </A>
              </div>
            </div>
          )}
        </Show>

        <Show when={!snapshot.loading && journeySteps().length > 0}>
          <OperationalFlowStepper steps={journeySteps()} title="Recorrido operativo del día" />
        </Show>

        <div class="flex flex-wrap gap-2">
          <For each={[...PLANNER_QUICK_ACTIONS]}>
            {(item) => {
              const Icon = quickActionIcons[item.id];
              return (
                <A href={item.href}>
                  <Button variant="outline" size="sm" class="gap-2">
                    <Icon size={14} />
                    {item.label}
                  </Button>
                </A>
              );
            }}
          </For>
        </div>

        <PlanningGlossaryStrip />

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader
              title="Semana actual"
              subtitle="Nivel directivo"
              action={
                <A href={weeklyPlanHref} class="text-xs font-medium text-fero-blue hover:underline">
                  Gestionar
                </A>
              }
            />
            <Show
              when={weekly()}
              fallback={<PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noWeeklyPlan} compact />}
            >
              {(plan) => (
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <CalendarDays size={16} class="text-fero-blue" />
                    <span class="text-sm font-semibold text-text-primary dark:text-white">
                      {plan().weekStartDate} → {plan().weekEndDate}
                    </span>
                  </div>
                  <PlanningStatusBadge status={plan().status} />
                  <p class="text-sm text-text-secondary">
                    {plan().daysConfigured} días · {plan().scheduledPoints} puntos
                  </p>
                </div>
              )}
            </Show>
          </Card>

          <Card>
            <CardHeader
              title="Hoy"
              subtitle="Nivel administrativo"
              action={
                <A href="/optimization" class="text-xs font-medium text-fero-blue hover:underline">
                  Gestionar
                </A>
              }
            />
            <Show
              when={daily()}
              fallback={<PlanningEmptyState {...PLANNING_EMPTY_PRESETS.noDailyPlan} compact />}
            >
              {(plan) => (
                <div class="space-y-2">
                  <div class="flex items-center gap-2">
                    <ClipboardList size={16} class="text-fero-green" />
                    <span class="text-sm font-semibold text-text-primary dark:text-white">{plan().operationDate}</span>
                  </div>
                  <PlanningStatusBadge status={plan().dispatched ? 'dispatched' : plan().status} />
                  <p class="text-sm text-text-secondary">
                    {plan().pointCount} puntos · {plan().pendingCount} pendientes en plan
                  </p>
                  <ProgressBar
                    value={Math.max(plan().pointCount - plan().pendingCount, 0)}
                    max={Math.max(plan().pointCount, 1)}
                    color="green"
                    size="sm"
                  />
                </div>
              )}
            </Show>
          </Card>

          <Card>
            <CardHeader
              title="Pendientes"
              subtitle="Carry-over abierto"
              action={
                <A href="/optimization#pendientes" class="text-xs font-medium text-fero-blue hover:underline">
                  Gestionar
                </A>
              }
            />
            <div class="flex items-center gap-3">
              <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40">
                <Route size={22} />
              </span>
              <div>
                <p class="text-3xl font-bold text-text-primary dark:text-white">
                  {snapshot()?.openPendingVisits ?? 0}
                </p>
                <p class="text-sm text-text-secondary">visitas sin cerrar</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Incidencias"
              subtitle="Nivel operativo"
              action={
                <A href="/monitoring" class="text-xs font-medium text-fero-blue hover:underline">
                  Monitoreo
                </A>
              }
            />
            <div class="flex items-center gap-3">
              <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40">
                <AlertTriangle size={22} />
              </span>
              <div>
                <p class="text-3xl font-bold text-text-primary dark:text-white">{snapshot()?.openIncidents ?? 0}</p>
                <p class="text-sm text-text-secondary">abiertas en operación</p>
              </div>
            </div>
          </Card>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <Card class="border-violet-300/40 bg-violet-50/50 dark:border-violet-900/30 dark:bg-violet-950/20">
            <CardHeader title="Directivo" subtitle="Plan semanal" />
            <p class="mb-3 text-sm text-text-secondary">Aprueba qué puntos visitar cada día de la semana.</p>
            <A href={weeklyPlanHref}>
              <Button size="sm" variant="outline" class="gap-2" icon={<CalendarDays size={14} />}>
                Plan semanal
              </Button>
            </A>
          </Card>
          <Card class="border-fero-blue/30 bg-fero-blue/5">
            <CardHeader title="Administrativo" subtitle="Plan del día" />
            <p class="mb-3 text-sm text-text-secondary">Optimiza, despacha y cierra la jornada.</p>
            <A href="/optimization">
              <Button size="sm" variant="outline" class="gap-2" icon={<Map size={14} />}>
                Planificación operativa
              </Button>
            </A>
          </Card>
          <Card class="border-amber-300/50 bg-amber-50/60 dark:border-amber-900/30 dark:bg-amber-950/20">
            <CardHeader title="Operativo + historial" subtitle="Monitoreo y auditoría" />
            <p class="mb-3 text-sm text-text-secondary">Incidencias en caliente y búsqueda unificada.</p>
            <div class="flex flex-wrap gap-2">
              <A href="/monitoring">
                <Button size="sm" variant="outline" icon={<Radio size={14} />}>
                  Monitoreo
                </Button>
              </A>
              <A href="/planning/history">
                <Button size="sm" variant="outline" icon={<History size={14} />}>
                  Historial
                </Button>
              </A>
            </div>
          </Card>
        </div>
      </section>
    </Show>
  );
}
