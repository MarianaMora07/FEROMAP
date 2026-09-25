import type {
  DaySimulation,
  DaySimulationResolution,
  DaySimulationScenario,
  DaySimulationStep,
  DaySimulationTarget,
} from '../api/daySimulation';
import type { DroppedPointDetail } from '../api/contingencies';
import type { RoutePlaybackModel } from '../route-playback/routePlaybackTypes';
import { isRoutePlaybackModel } from '../route-playback/routePlaybackValidation';

const RESOLUTIONS: readonly DaySimulationResolution[] = ['reassigned', 'pending', 'no_change'];
const CONTINGENCY_TYPES = ['breakdown', 'critical_container'] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isResolution(value: unknown): value is DaySimulationResolution {
  return typeof value === 'string' && (RESOLUTIONS as readonly string[]).includes(value);
}

function isContingencyType(value: unknown): value is DaySimulationStep['type'] {
  return typeof value === 'string' && (CONTINGENCY_TYPES as readonly string[]).includes(value);
}

function isTarget(value: unknown): value is DaySimulationTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as DaySimulationTarget;
  if (target.vehicleId !== undefined && typeof target.vehicleId !== 'string') return false;
  if (target.pointCode !== undefined && typeof target.pointCode !== 'string') return false;
  return target.vehicleId !== undefined || target.pointCode !== undefined;
}

function collectRoutes(value: unknown): RoutePlaybackModel[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRoutePlaybackModel);
}

export function isDroppedPointDetail(value: unknown): value is DroppedPointDetail {
  if (!value || typeof value !== 'object') return false;
  const detail = value as DroppedPointDetail;
  return (
    typeof detail.code === 'string' &&
    detail.code.length > 0 &&
    isFiniteNumber(detail.fillPct) &&
    typeof detail.criticality === 'string' &&
    detail.criticality.length > 0 &&
    isFiniteNumber(detail.priority)
  );
}

function collectDroppedDetails(value: unknown): DroppedPointDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDroppedPointDetail);
}

function isOptionalNullableNumber(value: unknown): boolean {
  return value === undefined || value === null || isFiniteNumber(value);
}

function isDaySimulationScenario(value: unknown): value is DaySimulationScenario {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as DaySimulationScenario;
  return (
    typeof scenario.id === 'string' &&
    scenario.id.length > 0 &&
    typeof scenario.label === 'string' &&
    isOptionalNullableNumber(scenario.trafficMultiplier) &&
    isOptionalNullableNumber(scenario.fillLevelBoost) &&
    isOptionalNullableNumber(scenario.distanceKm) &&
    isOptionalNullableNumber(scenario.baselineDistanceKm) &&
    isOptionalNullableNumber(scenario.durationHours)
  );
}

function normalizeScenario(value: unknown): DaySimulationScenario | null {
  if (!isDaySimulationScenario(value)) return null;
  return {
    id: value.id,
    label: value.label,
    trafficMultiplier: value.trafficMultiplier ?? null,
    fillLevelBoost: value.fillLevelBoost ?? null,
    distanceKm: value.distanceKm ?? null,
    baselineDistanceKm: value.baselineDistanceKm ?? null,
    durationHours: value.durationHours ?? null,
  };
}

/** Campos numéricos opcionales (retrocompatibilidad con payloads previos). */
function hasOptionalFinite(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function hasOptionalNullableFinite(value: unknown): boolean {
  return value === undefined || value === null || isFiniteNumber(value);
}

export function isDaySimulationStep(value: unknown): value is DaySimulationStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as DaySimulationStep;
  return (
    typeof step.id === 'string' &&
    step.id.length > 0 &&
    isFiniteNumber(step.atMinutes) &&
    step.atMinutes >= 0 &&
    isContingencyType(step.type) &&
    isTarget(step.target) &&
    Array.isArray(step.alternativeRoutes) &&
    step.alternativeRoutes.every(isRoutePlaybackModel) &&
    isResolution(step.resolution) &&
    Array.isArray(step.droppedPoints) &&
    step.droppedPoints.every((code) => typeof code === 'string') &&
    (step.droppedDetails === undefined ||
      (Array.isArray(step.droppedDetails) &&
        step.droppedDetails.every(isDroppedPointDetail))) &&
    hasOptionalFinite(step.reassignedPoints) &&
    hasOptionalNullableFinite(step.beforeDistanceKm) &&
    hasOptionalNullableFinite(step.afterDistanceKm) &&
    hasOptionalNullableFinite(step.distanceDeltaKm) &&
    hasOptionalFinite(step.baseStops) &&
    hasOptionalNullableFinite(step.stabilityPct) &&
    typeof step.message === 'string'
  );
}

export function isDaySimulation(value: unknown): value is DaySimulation {
  if (!value || typeof value !== 'object') return false;
  const simulation = value as DaySimulation;
  return (
    isPositiveNumber(simulation.dailyPlanId) &&
    typeof simulation.operationDate === 'string' &&
    simulation.operationDate.length > 0 &&
    isPositiveNumber(simulation.operationMinutes) &&
    isPositiveNumber(simulation.playbackDurationMinutes) &&
    Array.isArray(simulation.baseRoutes) &&
    simulation.baseRoutes.every(isRoutePlaybackModel) &&
    Array.isArray(simulation.steps) &&
    simulation.steps.every(isDaySimulationStep) &&
    (simulation.scenario === undefined ||
      simulation.scenario === null ||
      isDaySimulationScenario(simulation.scenario))
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeStep(value: unknown, operationMinutes: number): DaySimulationStep | null {
  if (!value || typeof value !== 'object') return null;
  const step = value as Partial<DaySimulationStep>;
  if (
    typeof step.id !== 'string' ||
    step.id.length === 0 ||
    !isContingencyType(step.type) ||
    !isTarget(step.target) ||
    !isResolution(step.resolution) ||
    typeof step.message !== 'string'
  ) {
    return null;
  }

  const atMinutes = isFiniteNumber(step.atMinutes) ? step.atMinutes : 0;
  return {
    id: step.id,
    atMinutes: Math.round(clamp(atMinutes, 0, operationMinutes)),
    type: step.type,
    target: step.target,
    alternativeRoutes: collectRoutes(step.alternativeRoutes),
    resolution: step.resolution,
    droppedPoints: Array.isArray(step.droppedPoints)
      ? step.droppedPoints.filter((code): code is string => typeof code === 'string')
      : [],
    droppedDetails: collectDroppedDetails(step.droppedDetails),
    reassignedPoints: isFiniteNumber(step.reassignedPoints) ? step.reassignedPoints : undefined,
    beforeDistanceKm:
      step.beforeDistanceKm === null || isFiniteNumber(step.beforeDistanceKm)
        ? (step.beforeDistanceKm ?? null)
        : undefined,
    afterDistanceKm:
      step.afterDistanceKm === null || isFiniteNumber(step.afterDistanceKm)
        ? (step.afterDistanceKm ?? null)
        : undefined,
    distanceDeltaKm:
      step.distanceDeltaKm === null || isFiniteNumber(step.distanceDeltaKm)
        ? (step.distanceDeltaKm ?? null)
        : undefined,
    baseStops: isFiniteNumber(step.baseStops) ? step.baseStops : undefined,
    stabilityPct:
      step.stabilityPct === null || isFiniteNumber(step.stabilityPct)
        ? (step.stabilityPct ?? null)
        : undefined,
    message: step.message,
  };
}

/**
 * Normaliza un payload crudo: descarta rutas alternativas inválidas y ordena los
 * pasos por `atMinutes` (el backend ya los emite ordenados). Devuelve `null` si la
 * estructura base no es recuperable.
 */
export function normalizeDaySimulation(value: unknown): DaySimulation | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DaySimulation>;
  if (
    !isPositiveNumber(raw.dailyPlanId) ||
    typeof raw.operationDate !== 'string' ||
    raw.operationDate.length === 0 ||
    !isPositiveNumber(raw.operationMinutes) ||
    !isPositiveNumber(raw.playbackDurationMinutes)
  ) {
    return null;
  }

  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((step) => normalizeStep(step, raw.operationMinutes as number))
    .filter((step): step is DaySimulationStep => step !== null)
    .sort((a, b) => a.atMinutes - b.atMinutes);

  return {
    dailyPlanId: raw.dailyPlanId,
    operationDate: raw.operationDate,
    operationMinutes: raw.operationMinutes,
    playbackDurationMinutes: raw.playbackDurationMinutes,
    baseRoutes: collectRoutes(raw.baseRoutes),
    steps,
    scenario: normalizeScenario(raw.scenario),
  };
}
