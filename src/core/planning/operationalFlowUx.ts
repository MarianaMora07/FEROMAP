import type { PlanningDashboardSnapshot } from '../api/planningAnalytics';
import { monitoringHref, optimizationHref, optimizationPlaybackHref } from './operationalLinks';
import { todayIso } from './planningUx';
import { weeklyPlanHref } from './weeklyPlanLinks';

export type OperationalJourneyStepId =
  | 'configure_week'
  | 'optimize_today'
  | 'simulate_route'
  | 'dispatch'
  | 'monitor';

export type JourneyStepStatus = 'complete' | 'current' | 'upcoming' | 'blocked';

export interface OperationalJourneyStep {
  id: OperationalJourneyStepId;
  label: string;
  shortLabel: string;
  href: string;
  status: JourneyStepStatus;
}

export type OptimizationExperienceStepId = 'situation' | 'routes' | 'playback';

export interface OptimizationExperienceStep {
  id: OptimizationExperienceStepId;
  label: string;
  description: string;
  status: JourneyStepStatus;
}

export interface OperationalJourneyInput {
  weeklyPlan: PlanningDashboardSnapshot['weeklyPlan'];
  dailyPlan: PlanningDashboardSnapshot['dailyPlan'];
  operationDate?: string;
}

export interface OptimizationExperienceInput {
  dailyStatus?: string | null;
  hasResults: boolean;
  playbackOpen: boolean;
  weeklyPlanApproved: boolean;
}

function isDispatched(daily: OperationalJourneyInput['dailyPlan']): boolean {
  if (!daily) return false;
  return daily.dispatched || daily.status === 'dispatched';
}

function isOptimized(daily: OperationalJourneyInput['dailyPlan']): boolean {
  if (!daily) return false;
  return daily.status === 'optimized' || daily.status === 'dispatched';
}

export function deriveOperationalJourneyStep(input: OperationalJourneyInput): OperationalJourneyStepId {
  const { weeklyPlan, dailyPlan } = input;

  if (!weeklyPlan || weeklyPlan.status === 'draft') return 'configure_week';
  if (!dailyPlan) return 'optimize_today';
  if (isDispatched(dailyPlan)) return 'monitor';
  if (dailyPlan.status === 'optimized') return 'simulate_route';
  return 'optimize_today';
}

export function buildOperationalJourneySteps(input: OperationalJourneyInput): OperationalJourneyStep[] {
  const date = input.dailyPlan?.operationDate ?? input.operationDate ?? todayIso();
  const dailyPlanId = input.dailyPlan?.id;
  const current = deriveOperationalJourneyStep(input);
  const weeklyApproved = Boolean(input.weeklyPlan && input.weeklyPlan.status !== 'draft');
  const optimized = isOptimized(input.dailyPlan);
  const dispatched = isDispatched(input.dailyPlan);

  const order: OperationalJourneyStepId[] = [
    'configure_week',
    'optimize_today',
    'simulate_route',
    'dispatch',
    'monitor',
  ];
  const currentIndex = order.indexOf(current);

  const statusFor = (stepId: OperationalJourneyStepId): JourneyStepStatus => {
    const index = order.indexOf(stepId);
    if (!weeklyApproved && stepId !== 'configure_week') return 'blocked';
    if (index < currentIndex) return 'complete';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  return [
    {
      id: 'configure_week',
      label: 'Configurar semana',
      shortLabel: 'Semana',
      href: weeklyPlanHref,
      status: statusFor('configure_week'),
    },
    {
      id: 'optimize_today',
      label: 'Optimizar hoy',
      shortLabel: 'Optimizar',
      href: optimizationHref({ date, dailyPlanId }),
      status: statusFor('optimize_today'),
    },
    {
      id: 'simulate_route',
      label: 'Simular recorrido',
      shortLabel: 'Simular',
      href: optimizationPlaybackHref({ date, dailyPlanId }),
      status: optimized || dispatched ? statusFor('simulate_route') : 'blocked',
    },
    {
      id: 'dispatch',
      label: 'Despachar',
      shortLabel: 'Despachar',
      href: optimizationHref({ date, dailyPlanId }),
      status: dispatched ? 'complete' : statusFor('dispatch'),
    },
    {
      id: 'monitor',
      label: 'Monitorear',
      shortLabel: 'Monitoreo',
      href: monitoringHref({ date, dailyPlanId, playback: dispatched }),
      status: statusFor('monitor'),
    },
  ];
}

export function deriveOptimizationExperienceStep(
  input: OptimizationExperienceInput,
): OptimizationExperienceStepId {
  if (input.playbackOpen && input.hasResults) return 'playback';
  if (input.hasResults || input.dailyStatus === 'optimized') return 'routes';
  return 'situation';
}

export function buildOptimizationExperienceSteps(
  input: OptimizationExperienceInput,
): OptimizationExperienceStep[] {
  const current = deriveOptimizationExperienceStep(input);
  const order: OptimizationExperienceStepId[] = ['situation', 'routes', 'playback'];
  const currentIndex = order.indexOf(current);

  const statusFor = (stepId: OptimizationExperienceStepId): JourneyStepStatus => {
    const index = order.indexOf(stepId);
    if (!input.weeklyPlanApproved && stepId !== 'situation') return 'blocked';
    if (index < currentIndex) return 'complete';
    if (index === currentIndex) return 'current';
    if (stepId === 'playback' && !input.hasResults) return 'blocked';
    return 'upcoming';
  };

  return [
    {
      id: 'situation',
      label: 'Situación del día',
      description: 'Escenario heredado y pendientes',
      status: statusFor('situation'),
    },
    {
      id: 'routes',
      label: 'Rutas generadas',
      description: 'Resultado de la optimización',
      status: statusFor('routes'),
    },
    {
      id: 'playback',
      label: 'Simulación de recorrido',
      description: 'Preview animado antes de despachar',
      status: statusFor('playback'),
    },
  ];
}

export function parsePlaybackQueryParam(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '1' || raw === 'true';
}
