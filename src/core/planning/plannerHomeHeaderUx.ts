import type { PlanningDashboardSnapshot } from '../api/planningAnalytics';
import { deriveNextPlannerAction } from './plannerHubUx';
import { todayIso } from './planningUx';

export function formatSpanishShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  const formatted = date.toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  return formatted.replace(/\./g, '').replace(/^\w/u, (char) => char.toLowerCase());
}

export function plannerHomeJourneySubtitle(operationDate?: string): string {
  const date = operationDate ?? todayIso();
  return `Tu jornada de planificación — ${formatSpanishShortDate(date)}`;
}

export function plannerHomeHeaderSubtitle(
  snapshot: PlanningDashboardSnapshot | undefined,
): string {
  if (!snapshot) {
    return plannerHomeJourneySubtitle();
  }
  const action = deriveNextPlannerAction(snapshot);
  const stepLabel = action.label.charAt(0).toLowerCase() + action.label.slice(1);
  return `Siguiente paso: ${stepLabel}`;
}

export function plannerHomeDateChipLabel(
  snapshot: PlanningDashboardSnapshot | undefined,
): string {
  const iso = snapshot?.dailyPlan?.operationDate ?? todayIso();
  const formatted = formatSpanishShortDate(iso);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
