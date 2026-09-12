import { For, Show, onMount } from 'solid-js';
import { canOptimize, isConductor, isResident } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { loadDashboardData, dashboardState, dashboardSummary } from '../../core/stores/dashboardStore';
import { PlannerHubSection } from '../planning/PlannerHubSection';
import { PlannerOverviewSection } from './PlannerOverviewSection';
import { OperationalSituationPanel } from './OperationalSituationPanel';
import { OperatorHubSection } from '../operator/OperatorHubSection';
import { ResidentHubSection } from '../resident/ResidentHubSection';

export default function DashboardPage() {
  onMount(() => {
    void loadDashboardData();
  });

  const showPlannerActions = () => canOptimize(authUser()?.role);
  const showOperatorView = () => isConductor(authUser()?.role);
  const showResidentView = () => isResident(authUser()?.role);

  return (
    <div class="space-y-4 md:space-y-5">
      <Show when={(dashboardSummary().roleKpis ?? []).length > 0}>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="role-kpis">
          <For each={dashboardSummary().roleKpis}>
            {(kpi) => (
              <div class="rounded-xl border border-default bg-surface px-4 py-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {kpi.label}
                </p>
                <p class="mt-1 text-xl font-bold text-text-primary dark:text-white">{kpi.value}</p>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={showResidentView()}>
        <ResidentHubSection variant="dashboard" />
      </Show>

      <Show when={showOperatorView()}>
        <OperatorHubSection variant="dashboard" />
      </Show>

      <Show when={showPlannerActions()}>
        <div>
          <h1 class="font-heading text-2xl font-bold text-text-primary dark:text-white">Dashboard</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Punto de entrada operativo: planifica la semana, despacha el día y supervisa el campo.
          </p>
        </div>

        <Show when={dashboardState.error}>
          <div
            role="alert"
            data-testid="dashboard-error"
            class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          >
            No se pudo cargar el resumen del dashboard. Verifica la conexión con el API.
          </div>
        </Show>

        <PlannerOverviewSection />
        <PlannerHubSection />
        <OperationalSituationPanel />
      </Show>
    </div>
  );
}
