import { createStore } from 'solid-js/store';
import {
  addWeeksToMonday,
  approveWeeklyPlan,
  archiveWeeklyPlan,
  autofillWeeklyPlanFromSchedules,
  compareWeeklyPlanVersions,
  createWeeklyPlan,
  fetchCurrentWeeklyPlan,
  fetchWeeklyPlanById,
  fetchWeeklyPlans,
  fetchWeeklyPlanVersions,
  downloadWeeklyPlanPdf,
  isPastWeek,
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
  selectedPlanId: number | null;
  versions: PlanVersion[];
  versionDiff: Array<{ path: string; before: unknown; after: unknown }>;
  collectionPoints: Array<{ id: number; code: string; sectorName?: string | null }>;
  isLoading: boolean;
  isSaving: boolean;
  isValidating: boolean;
  isApproving: boolean;
  isArchiving: boolean;
  isCreatingWeek: boolean;
  validationJobId: string | null;
  validationCompleted: boolean;
  error: string | null;
  notice: string | null;
}

const [state, setState] = createStore<WeeklyPlanState>({
  plan: null,
  history: [],
  selectedPlanId: null,
  versions: [],
  versionDiff: [],
  collectionPoints: [],
  isLoading: false,
  isSaving: false,
  isValidating: false,
  isApproving: false,
  isArchiving: false,
  isCreatingWeek: false,
  validationJobId: null,
  validationCompleted: false,
  error: null,
  notice: null,
});

async function fetchCollectionPointsForPlanning() {
  const { fetchCollectionPointsList } = await import('../api/collectionPoints');
  const points = await fetchCollectionPointsList();
  return points
    .map((point) => ({
      id: Number(point.numericId ?? point.id),
      code: point.id,
      sectorName: point.sector,
    }))
    .filter((point) => Number.isInteger(point.id) && point.id > 0);
}

async function refreshWeeklyPlanHistory(): Promise<WeeklyPlan[]> {
  const { items } = await fetchWeeklyPlans();
  setState({ history: items });
  return items;
}

async function resolvePlanFromHistory(planId: number): Promise<WeeklyPlan> {
  const fromList = state.history.find((row) => row.id === planId);
  if (fromList?.days?.length) return fromList;
  return fetchWeeklyPlanById(planId);
}

async function pickDefaultPlan(history: WeeklyPlan[]): Promise<WeeklyPlan | null> {
  const currentMonday = mondayIso();
  const currentWeekPlan = history.find((row) => row.weekStartDate === currentMonday);
  if (currentWeekPlan) {
    return currentWeekPlan.days?.length
      ? currentWeekPlan
      : fetchWeeklyPlanById(currentWeekPlan.id);
  }
  try {
    return await fetchCurrentWeeklyPlan();
  } catch {
    return history[0] ?? null;
  }
}

export async function initWeeklyPlanTab(): Promise<void> {
  setState({ isLoading: true, error: null });
  try {
    const [history, points] = await Promise.all([
      refreshWeeklyPlanHistory(),
      fetchCollectionPointsForPlanning(),
    ]);
    setState({ collectionPoints: points });
    const plan = await pickDefaultPlan(history);
    setState({
      plan,
      selectedPlanId: plan?.id ?? null,
      validationCompleted: false,
    });
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

export function nextWeekMonday(): string {
  return addWeeksToMonday(mondayIso(), 1);
}

export function canCreateNextWeekDraft(): boolean {
  const nextMonday = nextWeekMonday();
  return !state.history.some((row) => row.weekStartDate === nextMonday);
}

export function canCreateCurrentWeekDraft(): boolean {
  const currentMonday = mondayIso();
  return !state.history.some((row) => row.weekStartDate === currentMonday);
}

export function canArchivePlan(plan: WeeklyPlan | null | undefined): boolean {
  if (!plan) return false;
  return plan.status === 'approved' && isPastWeek(plan.weekStartDate);
}

export function deriveWeeklyFlowStep(): number {
  const plan = state.plan;
  if (!plan) return 1;
  if (plan.status === 'approved' || plan.status === 'archived') return 4;
  if (state.isValidating) return 2;
  if (state.validationCompleted) return 3;
  return 1;
}

export function isWeeklyPlanEditable(): boolean {
  return state.plan?.status === 'draft';
}

export async function selectWeeklyPlan(
  planId: number,
  options?: { compareLatestVersions?: boolean },
): Promise<void> {
  setState({ isLoading: true, error: null, versionDiff: [], versions: [] });
  try {
    const plan = await resolvePlanFromHistory(planId);
    setState({
      plan,
      selectedPlanId: planId,
      validationCompleted: false,
      notice: null,
    });
    if (options?.compareLatestVersions) {
      await loadWeeklyPlanVersions();
      await compareLatestWeeklyVersions();
    }
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar el plan semanal',
    });
  } finally {
    setState({ isLoading: false });
  }
}

async function compareLatestWeeklyVersions(): Promise<void> {
  if (!state.plan?.id || state.versions.length < 2) return;
  const sorted = [...state.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const latest = sorted[0]!;
  const previous = sorted[1]!;
  const diff = await compareWeeklyPlanVersions(state.plan.id, previous.versionNumber, latest.versionNumber);
  setState({ versionDiff: diff.changes });
}

export async function createWeekDraft(weekStartDate: string): Promise<void> {
  const existing = state.history.find((row) => row.weekStartDate === weekStartDate);
  if (existing) {
    if (existing.status === 'approved' || existing.status === 'archived') {
      throw new Error('Ya existe un plan aprobado para esa semana. No se puede sobrescribir.');
    }
    await selectWeeklyPlan(existing.id);
    setState({ notice: 'Ya hay un borrador para esa semana.' });
    return;
  }

  setState({ isCreatingWeek: true, error: null, notice: null });
  try {
    const points =
      state.collectionPoints.length > 0
        ? state.collectionPoints
        : await fetchCollectionPointsForPlanning();
    const pointIds = points.map((point) => point.id);
    const days = buildDefaultWeekDays(weekStartDate, pointIds);
    const plan = await createWeeklyPlan({
      weekStartDate,
      scenarioId: 'normal',
      days: days.map((day) => ({
        operationDate: day.operationDate,
        collectionPointIds: day.collectionPointIds,
      })),
    });
    await refreshWeeklyPlanHistory();
    setState({
      plan,
      selectedPlanId: plan.id,
      validationCompleted: false,
      notice: `Borrador creado para la semana del ${weekStartDate}.`,
    });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo crear el borrador semanal',
    });
    throw error;
  } finally {
    setState({ isCreatingWeek: false });
  }
}

export async function createNextWeekDraft(): Promise<void> {
  await createWeekDraft(nextWeekMonday());
}

export async function createCurrentWeekDraft(): Promise<void> {
  await createWeekDraft(mondayIso());
}

export async function archiveSelectedWeeklyPlan(): Promise<void> {
  if (!state.plan?.id) throw new Error('No hay plan seleccionado');
  if (!canArchivePlan(state.plan)) {
    throw new Error('Solo se pueden archivar planes aprobados de semanas pasadas');
  }
  setState({ isArchiving: true, error: null, notice: null });
  try {
    const plan = await archiveWeeklyPlan(state.plan.id);
    await refreshWeeklyPlanHistory();
    setState({ plan, notice: 'Plan semanal archivado.' });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo archivar el plan semanal',
    });
    throw error;
  } finally {
    setState({ isArchiving: false });
  }
}

export async function saveWeeklyPlanDraft(scenarioId: ScenarioId, days: WeeklyPlanDay[]): Promise<void> {
  setState({ isSaving: true, error: null, notice: null });
  try {
    const weekStart = state.plan?.weekStartDate ?? mondayIso();
    const payload = {
      weekStartDate: weekStart,
      scenarioId,
      days: days.map((day) => ({
        operationDate: day.operationDate,
        collectionPointIds: day.collectionPointIds,
      })),
    };
    const plan =
      state.plan?.status === 'draft' && state.plan.id
        ? await updateWeeklyPlan(state.plan.id, {
            scenarioId,
            days,
          })
        : await createWeeklyPlan(payload);
    await refreshWeeklyPlanHistory();
    setState({ plan, selectedPlanId: plan.id, notice: 'Plan semanal guardado en borrador.' });
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
  setState({ isValidating: true, error: null, notice: null, validationCompleted: false });
  try {
    const { jobId } = await validateWeeklyPlan(state.plan.id);
    setState({ validationJobId: jobId });
    while (true) {
      const snapshot = await fetchSimulationOptimizeJob(jobId);
      if (snapshot.status === 'completed' && snapshot.result) {
        setState({
          notice: `Validación completada — ${snapshot.result.kpis.distanceKm.optimized.toFixed(1)} km estimados.`,
          validationCompleted: true,
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
    await refreshWeeklyPlanHistory();
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
    await refreshWeeklyPlanHistory();
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

export async function showLatestVersionChanges(): Promise<void> {
  await loadWeeklyPlanVersions();
  await compareLatestWeeklyVersions();
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
