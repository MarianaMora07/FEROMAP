import type { DaySimulation, DaySimulationStep } from '../../core/api/daySimulation';
import type { DroppedPointDetail } from '../../core/api/contingencies';
import type { RoutePlaybackModel } from '../../core/route-playback/routePlaybackTypes';
import {
  formatClockTime,
  resolvePrimaryStartTime,
} from '../../core/route-playback/routePlaybackMath';

/** Punto de pausa de la animación: un evento guionado sobre el eje comprimido. */
export interface DaySimulationPausePoint {
  stepId: string;
  step: DaySimulationStep;
  /** Fracción 0..1 de la jornada en que aparece el evento. */
  fraction: number;
  /** Milisegundos del eje comprimido en que se pausa. */
  atMs: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Duración total del eje comprimido (5 min → 300 000 ms). */
export function playbackTotalMs(playbackDurationMinutes: number): number {
  if (!Number.isFinite(playbackDurationMinutes) || playbackDurationMinutes <= 0) return 1;
  return playbackDurationMinutes * 60_000;
}

/**
 * Compresión uniforme: la jornada (`operationMinutes`) se mapea a la fracción
 * 0..1 del eje de animación.
 */
export function stepFraction(atMinutes: number, operationMinutes: number): number {
  if (!Number.isFinite(operationMinutes) || operationMinutes <= 0) return 0;
  return clamp01(atMinutes / operationMinutes);
}

/** Puntos de pausa ordenados por fracción (eventos guionados del día). */
export function buildPausePoints(simulation: DaySimulation): DaySimulationPausePoint[] {
  const total = playbackTotalMs(simulation.playbackDurationMinutes);
  return simulation.steps
    .map((step) => {
      const fraction = stepFraction(step.atMinutes, simulation.operationMinutes);
      return { stepId: step.id, step, fraction, atMs: Math.round(fraction * total) };
    })
    .sort((a, b) => a.fraction - b.fraction);
}

/**
 * Primer punto de pausa que el progreso aún no alcanzó (excluye los ya resueltos).
 */
export function nextPausePoint(
  points: readonly DaySimulationPausePoint[],
  progress: number,
  completedStepIds: readonly string[] = [],
): DaySimulationPausePoint | null {
  const done = new Set(completedStepIds);
  for (const point of points) {
    if (done.has(point.stepId)) continue;
    if (progress + 1e-9 < point.fraction) continue;
    return point;
  }
  return null;
}

/**
 * Rutas del tramo tras resolver un paso (opción B: fusión).
 *
 * Se conservan las rutas **no afectadas** y se sustituyen las que el paso
 * replanifica:
 * - **Avería** (`target.vehicleId`): sale el vehículo averiado —queda fuera de
 *   servicio aunque no haya flota— y se anexa `alternativeRoutes`.
 * - **Contenedor crítico** (sin vehículo objetivo): salen las rutas cuyos
 *   vehículos vuelven a planificarse en `alternativeRoutes`; el resto se conserva.
 *
 * Las alternativas se deduplican por etiqueta de vehículo y sus `routeId`
 * sintéticos se reasignan si chocan con los del plan base. Si el paso no trae plan
 * alternativo, solo se retira el vehículo averiado (si lo hay): un contenedor
 * crítico sin flota deja el tramo igual.
 *
 * Limitación (ADR-003): la alternativa es la reoptimización del subconjunto
 * afectado, no el plan completo del día; un vehículo receptor puede mostrar solo
 * los puntos recibidos o compartir puntos con una ruta base.
 */
export function mergeStepRoutes(
  current: readonly RoutePlaybackModel[],
  step: DaySimulationStep,
): RoutePlaybackModel[] {
  const targetVehicleId = step.target.vehicleId;
  const replannedLabels = new Set(step.alternativeRoutes.map((route) => route.vehicleLabel));

  // 1. Conservar las rutas no afectadas por el paso (ni retiradas ni replanificadas).
  const merged = current.filter(
    (route) =>
      route.vehicleLabel !== targetVehicleId && !replannedLabels.has(route.vehicleLabel),
  );

  // 2. Anexar el plan alternativo, una ruta por camión y con `routeId` únicos.
  const usedIds = new Set(merged.map((route) => route.routeId));
  const seenLabels = new Set(merged.map((route) => route.vehicleLabel));
  let nextId = merged.reduce((max, route) => Math.max(max, route.routeId), 0) + 1;
  for (const route of step.alternativeRoutes) {
    if (seenLabels.has(route.vehicleLabel)) continue;
    seenLabels.add(route.vehicleLabel);
    if (usedIds.has(route.routeId)) {
      // Los ids alternativos son sintéticos (índice + 1); si chocan con un id real
      // del plan base, se reasignan para no colisionar en la animación.
      merged.push({ ...route, routeId: nextId, vehicleId: nextId });
      usedIds.add(nextId);
      nextId += 1;
    } else {
      usedIds.add(route.routeId);
      merged.push(route);
    }
  }
  return merged;
}

/** Reloj del día simulado (hora real de la jornada) según la fracción comprimida. */
export function simulatedDayClockLabel(
  routes: readonly RoutePlaybackModel[],
  progress: number,
  operationMinutes: number,
): string | null {
  const startIso = resolvePrimaryStartTime([...routes]);
  if (!startIso) return null;
  const base = new Date(startIso);
  if (Number.isNaN(base.getTime())) return null;
  const offsetMs = clamp01(progress) * Math.max(0, operationMinutes) * 60_000;
  return formatClockTime(new Date(base.getTime() + offsetMs));
}

/** Minutos de jornada transcurridos según la fracción comprimida. */
export function elapsedOperationMinutes(progress: number, operationMinutes: number): number {
  return Math.round(clamp01(progress) * Math.max(0, operationMinutes));
}

/** Criticidad → etiqueta legible. */
export const CRITICALITY_LABELS: Record<string, string> = {
  critico: 'Crítico',
  lleno: 'Lleno',
  normal: 'Normal',
  parcial: 'Parcial',
  fueraDeServicio: 'Fuera de servicio',
};

const CRITICALITY_RANK: Record<string, number> = {
  critico: 4,
  lleno: 3,
  normal: 2,
  parcial: 1,
  fueraDeServicio: 0,
};

export function criticalityLabel(code: string): string {
  return CRITICALITY_LABELS[code] ?? code;
}

/** Estabilidad del plan (%): 1 − reasignadas / base. Aplica solo a la avería. */
export function planStabilityPct(
  baseStops: number | undefined,
  reassignedPoints: number | undefined,
): number | null {
  if (baseStops == null || baseStops <= 0 || reassignedPoints == null) return null;
  const value = 100 * (1 - reassignedPoints / baseStops);
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

/** Estabilidad efectiva de un paso: la del backend o, si falta, derivada. */
export function stepStabilityPct(step: DaySimulationStep): number | null {
  if (step.stabilityPct !== undefined) return step.stabilityPct;
  return planStabilityPct(step.baseStops, step.reassignedPoints);
}

/** Etiqueta de impacto: “−12.5% estabilidad · 3 pts reasignados”. */
export function stepImpactLabel(step: DaySimulationStep): string {
  const parts: string[] = [];
  const stability = stepStabilityPct(step);
  if (stability != null) {
    const impact = Math.round((100 - stability) * 10) / 10;
    parts.push(`\u2212${impact}% estabilidad`);
  }
  const reassigned = step.reassignedPoints ?? 0;
  if (reassigned > 0) parts.push(`${reassigned} pts reasignados`);
  if (step.droppedPoints.length > 0) parts.push(`${step.droppedPoints.length} sin atender`);
  return parts.length > 0 ? parts.join(' · ') : 'Sin cambios';
}

export interface DroppedSummary {
  total: number;
  byCriticality: Array<{ criticality: string; label: string; count: number }>;
}

/** Resumen de los puntos sin atender agrupados por criticidad. */
export function droppedSummary(details: readonly DroppedPointDetail[]): DroppedSummary {
  const counts = new Map<string, number>();
  for (const detail of details) {
    counts.set(detail.criticality, (counts.get(detail.criticality) ?? 0) + 1);
  }
  const byCriticality = [...counts.entries()]
    .map(([criticality, count]) => ({ criticality, label: criticalityLabel(criticality), count }))
    .sort(
      (a, b) => (CRITICALITY_RANK[b.criticality] ?? 0) - (CRITICALITY_RANK[a.criticality] ?? 0),
    );
  return { total: details.length, byCriticality };
}

/**
 * Filtra las rutas que se representan según los camiones ocultos (por etiqueta).
 * Conjunto de ocultos vacío → se muestran todas.
 */
export function filterPlaybackRoutesByLabels(
  routes: readonly RoutePlaybackModel[],
  hiddenLabels: ReadonlySet<string>,
): RoutePlaybackModel[] {
  if (hiddenLabels.size === 0) return [...routes];
  return routes.filter((route) => !hiddenLabels.has(route.vehicleLabel));
}
