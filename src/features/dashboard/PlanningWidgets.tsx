import { Show, createResource } from 'solid-js';
import { A } from '@solidjs/router';
import { AlertTriangle, CalendarDays, ClipboardList, Route } from 'lucide-solid';
import { Badge, Card, CardHeader, ProgressBar } from '../../design-system/components';
import { fetchPlanningDashboardSnapshot } from '../../core/api/planningAnalytics';

export function PlanningWidgets() {
  const [snapshot] = createResource(() => fetchPlanningDashboardSnapshot());

  const weekly = () => snapshot()?.weeklyPlan;
  const daily = () => snapshot()?.dailyPlan;

  return (
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardHeader
          title="Plan semanal"
          subtitle="Nivel directivo"
          action={
            <A href="/simulation?view=weekly" class="text-xs font-medium text-fero-blue hover:underline">
              Ver plan
            </A>
          }
        />
        <Show
          when={weekly()}
          fallback={<p class="text-sm text-text-secondary">Sin plan semanal aprobado para esta semana.</p>}
        >
          {(plan) => (
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <CalendarDays size={16} class="text-fero-blue" />
                <span class="text-sm font-semibold text-text-primary dark:text-white">
                  {plan().weekStartDate} → {plan().weekEndDate}
                </span>
              </div>
              <Badge variant={plan().status === 'approved' ? 'success' : 'default'}>{plan().status}</Badge>
              <p class="text-sm text-text-secondary">
                {plan().daysConfigured} días · {plan().scheduledPoints} puntos programados
              </p>
            </div>
          )}
        </Show>
      </Card>

      <Card>
        <CardHeader
          title="Plan del día"
          subtitle="Nivel administrativo"
          action={
            <A href="/optimization" class="text-xs font-medium text-fero-blue hover:underline">
              Gestionar
            </A>
          }
        />
        <Show
          when={daily()}
          fallback={<p class="text-sm text-text-secondary">No hay plan del día abierto.</p>}
        >
          {(plan) => (
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <ClipboardList size={16} class="text-fero-green" />
                <span class="text-sm font-semibold text-text-primary dark:text-white">{plan().operationDate}</span>
              </div>
              <Badge variant={plan().dispatched ? 'success' : 'warning'}>{plan().status}</Badge>
              <p class="text-sm text-text-secondary">
                {plan().pointCount} puntos · {plan().pendingCount} pendientes incorporados
              </p>
              <ProgressBar
                value={plan().pointCount - plan().pendingCount}
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
          title="Operación en curso"
          subtitle="Nivel operativo"
          action={
            <A href="/monitoring" class="text-xs font-medium text-fero-blue hover:underline">
              Monitoreo
            </A>
          }
        />
        <ul class="space-y-3">
          <li class="flex items-center justify-between gap-2 text-sm">
            <span class="flex items-center gap-2 text-text-secondary">
              <AlertTriangle size={15} class="text-red-500" />
              Incidencias abiertas
            </span>
            <span class="font-semibold text-text-primary dark:text-white">{snapshot()?.openIncidents ?? 0}</span>
          </li>
          <li class="flex items-center justify-between gap-2 text-sm">
            <span class="flex items-center gap-2 text-text-secondary">
              <Route size={15} class="text-fero-blue" />
              Visitas pendientes
            </span>
            <span class="font-semibold text-text-primary dark:text-white">{snapshot()?.openPendingVisits ?? 0}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
