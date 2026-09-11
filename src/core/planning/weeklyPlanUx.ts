import type { PlanForecast, WeeklyPlan, WeeklyPlanForecast, WeeklyPlanPreflight } from '../api/planning';
import { optimizationDateHref, todayIso } from './planningUx';

export type WeeklyPlanPrimaryActionId = 'autofill' | 'validate' | 'approve' | 'goToDay';

export interface WeeklyPlanNextAction {
  message: string;
  detail: string;
  tone: 'warning' | 'info' | 'success';
  primaryActionId?: WeeklyPlanPrimaryActionId;
  primaryLabel?: string;
  primaryHref?: string;
}

export const weeklyPlanFlowSteps = [
  { id: 1, label: 'Configurar días', guide: 'asigna puntos por día y la condición de la semana' },
  { id: 2, label: 'Validar', guide: 'ejecuta una simulación rápida con todos los puntos de la semana' },
  { id: 3, label: 'Aprobar', guide: 'revisa el resultado y aprueba para habilitar el plan del día' },
  { id: 4, label: 'Ir al día', guide: 'continúa en planificación operativa para optimizar y despachar' },
] as const;

export type WeeklyPlanFlowStepId = (typeof weeklyPlanFlowSteps)[number]['id'];

export function canReachWeeklyPlanStep(targetStep: number, flowStep: number): boolean {
  if (targetStep < 1 || targetStep > 4) return false;
  if (targetStep <= flowStep) return true;
  if (targetStep === 3 && flowStep === 2) return true;
  return false;
}

export function weeklyPlanScheduledPointCount(plan: WeeklyPlan | null | undefined): number {
  if (!plan?.days?.length) return 0;
  const ids = new Set<number>();
  for (const day of plan.days) {
    for (const pointId of day.collectionPointIds) {
      ids.add(pointId);
    }
  }
  return ids.size;
}

export function weeklyPlanStepGuideText(step: number): string {
  const meta = weeklyPlanFlowSteps.find((item) => item.id === step);
  if (!meta) return '';
  return `Paso ${step} de ${weeklyPlanFlowSteps.length}: ${meta.guide}`;
}

export function weeklyPlanStepTitle(step: number): string {
  return weeklyPlanFlowSteps.find((item) => item.id === step)?.label ?? `Paso ${step}`;
}

export function weeklyPlanHasScheduledPoints(plan: WeeklyPlan | null | undefined): boolean {
  if (plan?.caseStudyId) return true;
  return Boolean(plan?.days?.some((day) => day.collectionPointIds.length > 0));
}

export interface WeeklyPlanValidationVehicle {
  vehicleCode: string;
  driverName?: string | null;
  distanceKm: number;
  durationMin: number;
  stops: number;
}

/** Previsualización por día del plan que calcularía el motor (no persistida). */
export interface WeeklyPlanValidationDay {
  operationDate: string;
  skipped: boolean;
  feasible: boolean;
  error?: string | null;
  distanceKm?: number | null;
  baselineDistanceKm?: number | null;
  durationHours?: number | null;
  coveragePct?: number | null;
  servedPoints?: number | null;
  uncoveredPoints?: number | null;
  vehicles: WeeklyPlanValidationVehicle[];
}

export interface WeeklyPlanValidationSummary {
  distanceKm: number;
  durationHours: number;
  scheduledPoints: number;
  coveredPoints: number;
  uncoveredPoints: number;
  exceedsWorkday: boolean;
  workdayHours: number;
  simulationId: number | null;
  /** Detalle día a día con camiones/conductores asignados (previsualización). */
  days: WeeklyPlanValidationDay[];
}

export function weeklyPlanValidationWorkdayWarning(summary: WeeklyPlanValidationSummary): string | null {
  if (!summary.exceedsWorkday) return null;
  return `La duración estimada supera la jornada de referencia (${summary.workdayHours} h). Revisa la carga diaria antes de aprobar.`;
}

export function weeklyPlanApproveBlockReason(validationCompleted: boolean): string | null {
  if (validationCompleted) return null;
  return 'Falta validar';
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function savingPct(baselineKm: number | null, optimizedKm: number | null): number | null {
  if (!baselineKm || !optimizedKm || baselineKm <= 0) return null;
  return roundTo((1 - optimizedKm / baselineKm) * 100, 1);
}

/** Ahorro % de una ruta/día frente a su línea base; `null` si no hay base comparable. */
export function weeklyPlanSavingPct(
  baselineKm: number | null | undefined,
  optimizedKm: number | null | undefined,
): number | null {
  if (baselineKm == null || optimizedKm == null) return null;
  return savingPct(baselineKm, optimizedKm);
}

/**
 * Construye el previsto semanal (`WeeklyPlanForecast`) a partir de la previsualización
 * por día de la validación ACO. Se persiste al aprobar para que las mejoras previstas
 * sobrevivan al recargar.
 */
export function buildWeeklyPlanForecastFromValidation(
  days: WeeklyPlanValidationDay[],
  weekStartDate: string,
): WeeklyPlanForecast | null {
  const active = days.filter((day) => !day.skipped && !day.error);
  if (active.length === 0) return null;

  const byDay: Record<string, PlanForecast> = {};
  let distanceKm = 0;
  let durationHours = 0;
  let baselineKm = 0;
  let hasBaseline = false;
  let scheduledPoints = 0;
  let coveredPoints = 0;
  let vehicleCount = 0;

  for (const day of active) {
    const served = day.servedPoints ?? 0;
    const uncovered = day.uncoveredPoints ?? 0;
    const dayScheduled = served + uncovered;
    const dayDistance = day.distanceKm ?? 0;
    const dayBaseline = day.baselineDistanceKm ?? null;
    byDay[day.operationDate] = {
      distanceKm: dayDistance,
      durationHours: day.durationHours ?? 0,
      baselineDistanceKm: dayBaseline,
      savingPct: savingPct(dayBaseline, dayDistance),
      scheduledPoints: dayScheduled,
      coveredPoints: served,
      uncoveredPoints: uncovered,
      coveragePct: day.coveragePct ?? null,
      vehicleCount: day.vehicles.length,
    };
    distanceKm += dayDistance;
    durationHours += day.durationHours ?? 0;
    if (dayBaseline) {
      baselineKm += dayBaseline;
      hasBaseline = true;
    }
    scheduledPoints += dayScheduled;
    coveredPoints += served;
    vehicleCount += day.vehicles.length;
  }

  return {
    weekStartDate,
    distanceKm: roundTo(distanceKm, 1),
    durationHours: roundTo(durationHours, 2),
    baselineDistanceKm: hasBaseline ? roundTo(baselineKm, 1) : null,
    savingPct: hasBaseline ? savingPct(baselineKm, distanceKm) : null,
    scheduledPoints,
    coveredPoints,
    uncoveredPoints: Math.max(0, scheduledPoints - coveredPoints),
    coveragePct: scheduledPoints > 0 ? roundTo((coveredPoints / scheduledPoints) * 100, 1) : null,
    vehicleCount,
    days: byDay,
  };
}

export interface WeeklyPlanPreflightIssue {
  operationDate: string;
  overloaded: boolean;
  insufficientFleet: boolean;
}

/** Días con problemas de viabilidad (sobrecapacidad o flota insuficiente). */
export function weeklyPlanPreflightIssues(
  preflight: WeeklyPlanPreflight | null | undefined,
): WeeklyPlanPreflightIssue[] {
  if (!preflight?.rows?.length) return [];
  return preflight.rows
    .filter((row) => row.overloaded || row.insufficientFleet)
    .map((row) => ({
      operationDate: row.operationDate ?? '—',
      overloaded: Boolean(row.overloaded),
      insufficientFleet: Boolean(row.insufficientFleet),
    }));
}

export interface WeeklyPlanPostApprovalStep {
  id: string;
  label: string;
  status: 'complete' | 'current' | 'upcoming';
  href?: string;
}

export function buildWeeklyPlanPostApprovalChecklist(): WeeklyPlanPostApprovalStep[] {
  const todayHref = optimizationDateHref(todayIso());
  return [
    { id: 'approved', label: 'Semana aprobada', status: 'complete' },
    { id: 'open_day', label: 'Abrir plan de hoy', status: 'current', href: todayHref },
    { id: 'optimize', label: 'Optimizar hoy', status: 'upcoming', href: todayHref },
    { id: 'dispatch', label: 'Despachar', status: 'upcoming', href: todayHref },
  ];
}

export function deriveWeeklyPlanFlowStep(input: {
  plan: WeeklyPlan | null;
  isValidating: boolean;
  validationCompleted: boolean;
}): number {
  const plan = input.plan;
  if (!plan) return 1;
  if (plan.status === 'approved' || plan.status === 'archived') return 4;
  if (input.isValidating) return 2;
  if (input.validationCompleted) return 3;
  if (weeklyPlanHasScheduledPoints(plan)) return 2;
  return 1;
}

export function deriveWeeklyPlanNextAction(input: {
  plan: WeeklyPlan | null;
  flowStep: number;
}): WeeklyPlanNextAction | null {
  const plan = input.plan;
  if (!plan) {
    return {
      message: 'Semana sin plan',
      detail: 'Selecciona una semana de la lista o crea un borrador para comenzar.',
      tone: 'warning',
      primaryActionId: 'autofill',
      primaryLabel: 'Autocompletar desde frecuencias',
    };
  }

  if (plan.status === 'archived') {
    return {
      message: 'Plan archivado',
      detail: 'Solo consulta. Crea un borrador en una semana futura si necesitas planificar de nuevo.',
      tone: 'info',
    };
  }

  if (plan.status === 'approved') {
    return {
      message: 'Semana aprobada',
      detail: 'El equipo administrativo ya puede optimizar y despachar el día.',
      tone: 'success',
      primaryActionId: 'goToDay',
      primaryLabel: 'Ir al plan de hoy',
      primaryHref: optimizationDateHref(todayIso()),
    };
  }

  switch (input.flowStep) {
    case 1:
      return {
        message: 'Configura la semana',
        detail: 'Autocompleta o revisa los días → valida con el motor → aprueba.',
        tone: 'warning',
        primaryActionId: 'autofill',
        primaryLabel: 'Autocompletar desde frecuencias',
      };
    case 2:
      return {
        message: 'Valida el plan',
        detail: 'Ejecuta una simulación con los puntos de la semana antes de aprobar.',
        tone: 'info',
        primaryActionId: 'validate',
        primaryLabel: 'Validar con simulación',
      };
    case 3:
      return {
        message: 'Listo para aprobar',
        detail: 'Aprueba el plan para habilitar el plan del día en operación.',
        tone: 'info',
        primaryActionId: 'approve',
        primaryLabel: 'Aprobar plan',
      };
    default:
      return null;
  }
}
