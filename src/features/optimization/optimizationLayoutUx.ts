import {
  buildOptimizationExperienceSteps,
  deriveOptimizationExperienceStep,
} from '../../core/planning/operationalFlowUx';

export function formatOptimizationToolbarDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date
    .toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
}

export function optimizationToolbarSummary(params: {
  operationDate: string;
  pointCount: number;
}): string {
  const date = formatOptimizationToolbarDate(params.operationDate);
  return `${date} · ${params.pointCount} pts`;
}

export function optimizationActiveStepChipLabel(input: {
  dailyStatus?: string | null;
  hasResults: boolean;
  playbackOpen: boolean;
  weeklyPlanApproved: boolean;
}): string {
  const current = deriveOptimizationExperienceStep(input);
  const step = buildOptimizationExperienceSteps(input).find((item) => item.id === current);
  const index = ['situation', 'routes', 'playback'].indexOf(current);
  return `Paso ${index + 1}: ${step?.label ?? current}`;
}

export function shouldFleetAccordionStartOpen(assignableVehicleCount: number): boolean {
  return assignableVehicleCount === 0;
}

export type OptimizationContextualMessage = {
  message: string;
  href: string;
  linkLabel: string;
  tone?: 'success' | 'info';
};

export function resolveOptimizationContextualMessage(input: {
  closeNotice?: string | null;
  closeNoticeHref?: string | null;
}): OptimizationContextualMessage | null {
  if (input.closeNotice && input.closeNoticeHref) {
    return {
      message: input.closeNotice,
      href: input.closeNoticeHref,
      linkLabel: 'Ver plan de mañana',
      tone: 'info',
    };
  }
  return null;
}

/**
 * Banda de estado contextual (BDC, Fase E). Determina **una sola** banda visible por
 * prioridad: error > semana sin aprobar > despacho > cierre. Devuelve `null` cuando no hay
 * nada que avisar (el caso normal de una jornada en curso sin incidencias).
 */
export type OptimizationContextBandKind = 'error' | 'week-pending' | 'dispatched' | 'closed';

export function resolveOptimizationContextBand(input: {
  error?: string | null;
  weeklyPlanApproved: boolean;
  dispatchVisible: boolean;
  closeNotice?: string | null;
}): OptimizationContextBandKind | null {
  if (input.error) return 'error';
  if (!input.weeklyPlanApproved) return 'week-pending';
  if (input.dispatchVisible) return 'dispatched';
  if (input.closeNotice) return 'closed';
  return null;
}

