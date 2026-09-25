import type { RoutePlaybackModel } from '../route-playback/routePlaybackTypes';
import type {
  ContingencySimulationResolution,
  ContingencySimulationType,
  DroppedPointDetail,
} from './contingencies';
import { isDaySimulation } from '../planning/daySimulationValidation';
import { mockDaySimulation } from '../../data/mock/daySimulation';
import { apiGet, withMockFallback } from './client';

export type DaySimulationResolution = ContingencySimulationResolution;

/** A quién afecta el evento guionado del día. */
export interface DaySimulationTarget {
  vehicleId?: string;
  pointCode?: string;
}

/** Un evento de contingencia dentro de la secuencia animada. */
export interface DaySimulationStep {
  id: string;
  /** Minutos de jornada en que aparece el evento (escala de `operationMinutes`). */
  atMinutes: number;
  type: ContingencySimulationType;
  target: DaySimulationTarget;
  /** Plan alternativo del paso, ya resuelto por el motor (dry-run). */
  alternativeRoutes: RoutePlaybackModel[];
  resolution: DaySimulationResolution;
  /** Códigos de puntos que quedarían sin atender. */
  droppedPoints: string[];
  /** Triage de esos puntos, ordenado por criticidad y prioridad. */
  droppedDetails?: DroppedPointDetail[];
  /** Puntos reasignados / reoptimizados en el paso. */
  reassignedPoints?: number;
  beforeDistanceKm?: number | null;
  afterDistanceKm?: number | null;
  distanceDeltaKm?: number | null;
  /** Paradas del tramo base antes del paso. */
  baseStops?: number;
  /** Estabilidad del plan del paso (solo avería); `null` si no aplica. */
  stabilityPct?: number | null;
  message: string;
}

/** Escenario bajo el que se recalculó la simulación (p. ej. lluvia o saturación). */
export interface DaySimulationScenario {
  id: string;
  label: string;
  trafficMultiplier?: number | null;
  fillLevelBoost?: number | null;
  /** KPIs del día recalculado bajo el escenario. */
  distanceKm?: number | null;
  baselineDistanceKm?: number | null;
  durationHours?: number | null;
}

/** Secuencia guionada y precomputada para animar un día del plan. */
export interface DaySimulation {
  dailyPlanId: number;
  operationDate: string;
  /** Jornada base en minutos (para comprimir la animación). */
  operationMinutes: number;
  /** Duración objetivo de la animación en el frontend. */
  playbackDurationMinutes: number;
  baseRoutes: RoutePlaybackModel[];
  steps: DaySimulationStep[];
  /** Resumen del escenario reoptimizado; `null`/ausente si se usó el plan vigente. */
  scenario?: DaySimulationScenario | null;
}

/**
 * Trae la secuencia guionada del día (`GET /planning/daily/{id}/simulation`).
 * Solo lectura: el backend precomputa los eventos con dry-run y no persiste nada.
 *
 * Con `scenarioId` distinto al del plan, el backend reoptimiza el día bajo ese escenario
 * (p. ej. `rain`) antes de guionar la secuencia.
 */
export function fetchDaySimulation(
  dailyPlanId: number,
  scenarioId?: string | null,
): Promise<DaySimulation> {
  const query = scenarioId ? `?scenarioId=${encodeURIComponent(scenarioId)}` : '';
  return withMockFallback(
    `day-simulation-${dailyPlanId}${scenarioId ? `-${scenarioId}` : ''}`,
    async () => {
      const payload = await apiGet<unknown>(
        `/api/v1/planning/daily/${dailyPlanId}/simulation${query}`,
      );
      if (!isDaySimulation(payload)) {
        throw new Error('Respuesta inválida de la simulación del día.');
      }
      return payload;
    },
    mockDaySimulation(dailyPlanId),
  );
}
