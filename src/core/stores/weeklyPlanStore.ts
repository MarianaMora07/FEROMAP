import { createStore } from 'solid-js/store';
import {
  approveWeeklyPlan,
  autofillWeeklyPlanFromSchedules,
  compareWeeklyPlanVersions,
  createWeeklyPlan,
  fetchCurrentWeeklyPlan,
  fetchWeeklyPlans,
  fetchWeeklyPlanVersions,
  downloadWeeklyPlanPdf,
  mondayIso,
  updateWeeklyPlan,
  validateWeeklyPlan,
  type PlanVersion,
  type WeeklyPlan,
  type WeeklyPlanDay,
} from '../api/planning';
import type { ScenarioId } from '../../data/types/simulation';
import { fetchSimulationOptimizeJob } from '../api/simulationJobs';

interface WeeklyPlanState {
  plan: WeeklyPlan | null;
  history: WeeklyPlan[];
  versions: PlanVersion[];
  versionDiff: Array<{ path: string; before: unknown; after: unknown }>;
  collectionPoints: Array<{ id: number; code: string; sectorName?: string | null }>;
  isLoading: boolean;
  isSaving: boolean;
  isValidating: boolean;
  isApproving: boolean;
  validationJobId: string | null;
  error: string | null;
  notice: string | null;
}

const [state, setState] = createStore<WeeklyPlanState>({
  plan: null,
  history: [],
  versions: [],
  versionDiff: [],
  collectionPoints: [],
  isLoading: false,
  isSaving: false,
  isValidating: false,
  isApproving: false,
  validationJobId: null,
  error: null,
  notice: null,
});

async function fetchCollectionPointsForPlanning() {
  const { fetchCollectionPointsList } = await import('../api/collectionPoints');
  const points = await fetchCollectionPointsList();
  return points.map((point) => ({
    id: Number(point.id),
    code: point.code,
    sectorName: point.sector,
  }));
}

export async function initWeeklyPlanTab(): Promise<void> {
  setState({ isLoading: true, error: null });
  try {
    const [history, points] = await Promise.all([
      fetchWeeklyPlans(),
      fetchCollectionPointsForPlanning(),
    ]);
    setState({ history: history.items, collectionPoints: points });
    try {
      const current = await fetchCurrentWeeklyPlan();
      setState({ plan: current });
    } catch {
      setState({ plan: null });
    }
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar el plan semanal',
    });
  } finally {
    setState({ isLoading: false });
  }
}

export function buildDefaultWeekDays(weekStart: string, pointIds: number[]): WeeklyPlanDay[] {
  const days: WeeklyPlanDay[] = [];
  const chunk = Math.max(1, Math.ceil(pointIds.length / 5));
  for (let offset = 0; offset < 5; offset += 1) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + offset);
    const slice = pointIds.slice(offset * chunk, (offset + 1) * chunk);
    days.push({
      operationDate: date.toISOString().slice(0, 10),
      weekday: date.getDay() === 0 ? 6 : date.getDay() - 1,
      sectorIds: [],
      collectionPointIds: slice,
    });
  }
  return days;
}

export async function saveWeeklyPlanDraft(scenarioId: ScenarioId, days: WeeklyPlanDay[]): Promise<void> {
  setState({ isSaving: true, error: null, notice: null });
  try {
    const weekStart = mondayIso();
    const payload = {
      weekStartDate: weekStart,
      scenarioId,
      days: days.map((day) => ({
        operationDate: day.operationDate,
        collectionPointIds: day.collectionPointIds,
      })),
    };
    const plan = state.plan?.status === 'draft' && state.plan.id
      ? await updateWeeklyPlan(state.plan.id, {
          scenarioId,
          days,
        })
      : await createWeeklyPlan(payload);
    setState({ plan, notice: 'Plan semanal guardado en borrador.' });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo guardar el plan semanal',
    });
    throw error;
  } finally {
    setState({ isSaving: false });
  }
}

export async function runWeeklyValidation(): Promise<void> {
  if (!state.plan?.id) {
    throw new Error('Primero guarda un borrador del plan semanal');
  }
  setState({ isValidating: true, error: null, notice: null });
  try {
    const { jobId } = await validateWeeklyPlan(state.plan.id);
    setState({ validationJobId: jobId });
    while (true) {
      const snapshot = await fetchSimulationOptimizeJob(jobId);
      if (snapshot.status === 'completed' && snapshot.result) {
        setState({
          notice: `Validación completada — ${snapshot.result.kpis.distanceKm.optimized.toFixed(1)} km estimados.`,
        });
        break;
      }
      if (snapshot.status === 'failed') {
        throw new Error(snapshot.error ?? 'La validación falló');
      }
      if (snapshot.status === 'cancelled') {
        throw new Error('Validación cancelada');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo validar el plan semanal',
    });
    throw error;
  } finally {
    setState({ isValidating: false, validationJobId: null });
  }
}

export async function approveCurrentWeeklyPlan(referenceSimulationId?: number): Promise<void> {
  if (!state.plan?.id) {
    throw new Error('No hay plan semanal para aprobar');
  }
  setState({ isApproving: true, error: null, notice: null });
  try {
    const plan = await approveWeeklyPlan(state.plan.id, { referenceSimulationId });
    setState({ plan, notice: 'Plan semanal aprobado.' });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo aprobar el plan semanal',
    });
    throw error;
  } finally {
    setState({ isApproving: false });
  }
}

export function setWeeklyPlanDays(days: WeeklyPlanDay[]): void {
  if (!state.plan) {
    setState('plan', {
      id: 0,
      weekStartDate: mondayIso(),
      weekEndDate: days[days.length - 1]?.operationDate ?? mondayIso(),
      status: 'draft',
      scenarioId: 'normal',
      days,
    });
    return;
  }
  setState('plan', 'days', days);
}

export function setWeeklyScenario(scenarioId: ScenarioId): void {
  if (!state.plan) {
    setState('plan', {
      id: 0,
      weekStartDate: mondayIso(),
      weekEndDate: mondayIso(),
      status: 'draft',
      scenarioId,
      days: [],
    });
    return;
  }
  setState('plan', 'scenarioId', scenarioId);
}

export async function autofillWeeklyFromSchedules(): Promise<void> {
  if (!state.plan?.id) {
    throw new Error('Guarda un borrador antes de autocompletar');
  }
  setState({ isSaving: true, error: null, notice: null });
  try {
    const plan = await autofillWeeklyPlanFromSchedules(state.plan.id);
    setState({ plan, notice: 'Semana autogenerada desde frecuencias de puntos.' });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo autocompletar la semana',
    });
    throw error;
  } finally {
    setState({ isSaving: false });
  }
}

export async function loadWeeklyPlanVersions(): Promise<void> {
  if (!state.plan?.id) return;
  const { items } = await fetchWeeklyPlanVersions(state.plan.id);
  setState({ versions: items });
}

export async function compareWeeklyVersions(versionA: number, versionB: number): Promise<void> {
  if (!state.plan?.id) return;
  const diff = await compareWeeklyPlanVersions(state.plan.id, versionA, versionB);
  setState({ versionDiff: diff.changes });
}

export async function exportWeeklyPlanPdf(): Promise<void> {
  if (!state.plan?.id) throw new Error('No hay plan para exportar');
  const blob = await downloadWeeklyPlanPdf(state.plan.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `plan-semanal-${state.plan.id}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { state as weeklyPlanState };
