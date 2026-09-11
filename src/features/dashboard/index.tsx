import { Show, onMount } from 'solid-js';
import { canOptimize, isConductor, isResident } from '../../core/auth/permissions';
import { authUser } from '../../core/stores/authStore';
import { loadDashboardData } from '../../core/stores/dashboardStore';
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

        <PlannerOverviewSection />
        <PlannerHubSection />
        <OperationalSituationPanel />
      </Show>
    </div>
  );
}
