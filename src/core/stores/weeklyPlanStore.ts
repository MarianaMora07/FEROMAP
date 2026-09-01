import { createStore } from 'solid-js/store';
import {
  addWeeksToMonday,
  approveWeeklyPlan,
  archiveWeeklyPlan,
  autofillWeeklyPlanFromCaseStudy,
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
  sanitizeWeeklyPlanDays,
  updateWeeklyPlan,
  validateWeeklyPlan,
  type PlanVersion,
  type WeeklyPlan,
  type WeeklyPlanDay,
} from '../api/planning';
import type { ScenarioId } from '../../data/types/simulation';
import { deriveWeeklyPlanFlowStep as resolveWeeklyPlanFlowStep, weeklyPlanScheduledPointCount } from '../planning/weeklyPlanUx';
import type { WeeklyPlanValidationSummary } from '../planning/weeklyPlanUx';
import {
  addDaysToIso,
  compactWeeklyPlanDaysForSave,
  mergeWeekCalendarDays,
  summarizeWeeklyPlanAssignment,
} from '../planning/weeklyPlanCalendar';
import { fetchActiveVisitSchedules, type VisitSchedule } from '../api/visitSchedules';
import { fetchSimulationOptimizeJob } from '../api/simulationJobs';
import { fetchCollectionPointsForPlanning } from '../api/collectionPoints';
import { fetchCaseStudies, fetchCaseStudyDetail, type CaseStudyDetail } from '../api/caseStudies';

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
  validationProgress: number;
  validationSummary: WeeklyPlanValidationSummary | null;
  visitSchedules: VisitSchedule[];
  draftCaseStudy: CaseStudyDetail | null;
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
  validationProgress: 0,
  validationSummary: null,
  visitSchedules: [],
  draftCaseStudy: null,
  error: null,
  notice: null,
});

async function refreshVisitSchedules(reference?: string): Promise<VisitSchedule[]> {
  const items = await fetchActiveVisitSchedules(reference);
  setState({ visitSchedules: items });
  return items;
}

function withCalendarDays(plan: WeeklyPlan | null): WeeklyPlan | null {
  if (!plan) return null;
  return {
    ...plan,
    days: mergeWeekCalendarDays(plan.weekStartDate, plan.days ?? []),
  };
}

export function getCollectionPointRef(pointId: number) {
  return state.collectionPoints.find((point) => point.id === pointId);
}

async function loadCollectionPointsForPlanning() {
  return fetchCollectionPointsForPlanning();
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
      loadCollectionPointsForPlanning(),
    ]);
    setState({ collectionPoints: points });
    const plan = withCalendarDays(await pickDefaultPlan(history));
    setState({
      plan,
      selectedPlanId: plan?.id ?? null,
      validationCompleted: false,
      validationSummary: null,
      validationProgress: 0,
    });
    if (plan?.weekStartDate) {
      await refreshVisitSchedules(plan.weekStartDate);
    }
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo cargar el plan semanal',
    });
  } finally {
    setState({ isLoading: false });
  }
}

export function buildWorkdayShells(weekStart: string): WeeklyPlanDay[] {
  return mergeWeekCalendarDays(weekStart, []).slice(0, 5).map((day) => ({
    ...day,
    collectionPointIds: [],
    pointSource: 'case_study',
  }));
}

export function buildDefaultWeekDays(weekStart: string, pointIds: number[]): WeeklyPlanDay[] {
  const workdays = mergeWeekCalendarDays(weekStart, []).slice(0, 5);
  const chunk = Math.max(1, Math.ceil(pointIds.length / 5));
  return workdays.map((day, offset) => ({
    ...day,
    collectionPointIds: pointIds.slice(offset * chunk, (offset + 1) * chunk),
  }));
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
  return resolveWeeklyPlanFlowStep({
    plan: state.plan,
    isValidating: state.isValidating,
    validationCompleted: state.validationCompleted,
  });
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
    const plan = withCalendarDays(await resolvePlanFromHistory(planId));
    setState({
      plan,
      selectedPlanId: planId,
      validationCompleted: false,
      notice: null,
      validationSummary: null,
      validationProgress: 0,
    });
    await syncDraftCaseStudyFromPlan(plan);
    if (plan?.weekStartDate) {
      await refreshVisitSchedules(plan.weekStartDate);
    }
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

async function resolveDefaultDraftCaseStudy(): Promise<CaseStudyDetail | null> {
  if (state.draftCaseStudy) return state.draftCaseStudy;
  const response = await fetchCaseStudies({ limit: 1 });
  const first = response.items[0];
  if (!first) return null;
  const detail = await fetchCaseStudyDetail(first.id);
  setState({ draftCaseStudy: detail });
  return detail;
}

async function syncDraftCaseStudyFromPlan(plan: WeeklyPlan | null): Promise<void> {
  if (!plan?.caseStudyId) {
    return;
  }
  if (state.draftCaseStudy?.id === plan.caseStudyId) {
    return;
  }
  try {
    setState({ draftCaseStudy: await fetchCaseStudyDetail(plan.caseStudyId) });
  } catch {
    setState({ draftCaseStudy: null });
  }
}

export function setDraftCaseStudy(detail: CaseStudyDetail | null): void {
  setState({ draftCaseStudy: detail });
}

export async function applyWeeklyCaseStudy(detail: CaseStudyDetail | null): Promise<void> {
  setState({ draftCaseStudy: detail });
  if (!state.plan) return;
  const scenarioId = detail?.defaultScenarioId ?? state.plan.scenarioId;
  setState('plan', {
    caseStudyId: detail?.id ?? null,
    caseStudyCode: detail?.code ?? null,
    caseStudyName: detail?.name ?? null,
    scenarioId,
  });
  if (!state.plan.id) return;
  if (detail) {
    await autofillWeeklyFromCaseStudy(detail.id);
    return;
  }
  await saveWeeklyPlanDraft(scenarioId, state.plan.days ?? []);
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
    const caseStudy = await resolveDefaultDraftCaseStudy();
    if (!caseStudy) {
      throw new Error('No hay casos de estudio disponibles. Crea uno en Análisis → Casos de estudio.');
    }
    const days = buildWorkdayShells(weekStartDate);
    let plan = withCalendarDays(
      await createWeeklyPlan({
        weekStartDate,
        scenarioId: caseStudy.defaultScenarioId ?? 'normal',
        caseStudyId: caseStudy.id,
        days: compactWeeklyPlanDaysForSave(weekStartDate, days).map((day) => ({
          operationDate: day.operationDate,
          collectionPointIds: day.collectionPointIds,
        })),
      }),
    );
    if (plan?.id) {
      plan = withCalendarDays(await autofillWeeklyPlanFromCaseStudy(plan.id, caseStudy.id));
    }
    await refreshWeeklyPlanHistory();
    setState({
      plan,
      selectedPlanId: plan?.id ?? null,
      draftCaseStudy: caseStudy,
      validationCompleted: false,
      validationSummary: null,
      validationProgress: 0,
      notice: `Borrador creado para la semana del ${weekStartDate} con caso ${caseStudy.code}.`,
    });
    if (plan?.weekStartDate) {
      await refreshVisitSchedules(plan.weekStartDate);
    }
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
    const plan = withCalendarDays(await archiveWeeklyPlan(state.plan.id));
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
    const calendarDays = mergeWeekCalendarDays(weekStart, days);
    const sanitizedDays = sanitizeWeeklyPlanDays(compactWeeklyPlanDaysForSave(weekStart, calendarDays));
    const payload = {
      weekStartDate: weekStart,
      scenarioId,
      caseStudyId: state.plan?.caseStudyId ?? state.draftCaseStudy?.id ?? null,
      days: sanitizedDays.map((day) => ({
        operationDate: day.operationDate,
        collectionPointIds: day.collectionPointIds,
      })),
    };
    const plan = withCalendarDays(
      state.plan?.status === 'draft' && state.plan.id
        ? await updateWeeklyPlan(state.plan.id, {
            scenarioId,
            caseStudyId: payload.caseStudyId,
            days: sanitizedDays,
          })
        : await createWeeklyPlan(payload),
    );
    await refreshWeeklyPlanHistory();
    setState({
      plan,
      selectedPlanId: plan?.id ?? null,
      notice: 'Plan semanal guardado en borrador.',
      validationCompleted: false,
      validationSummary: null,
    });
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
  setState({ isValidating: true, error: null, notice: null, validationCompleted: false, validationSummary: null, validationProgress: 0 });
  try {
    const { jobId } = await validateWeeklyPlan(state.plan.id);
    setState({ validationJobId: jobId });
    while (true) {
      const snapshot = await fetchSimulationOptimizeJob(jobId);
      setState({ validationProgress: snapshot.progress ?? 0 });
      if (snapshot.status === 'completed' && snapshot.result) {
        const kpis = snapshot.result.kpis;
        setState({
          notice: `Validación completada — ${kpis.distanceKm.optimized.toFixed(1)} km estimados.`,
          validationCompleted: true,
          validationSummary: {
            distanceKm: kpis.distanceKm.optimized,
            durationHours: kpis.durationHours.optimized,
            scheduledPoints: weeklyPlanScheduledPointCount(state.plan),
            coveredPoints: kpis.containersServed ?? weeklyPlanScheduledPointCount(state.plan),
            uncoveredPoints: kpis.uncoveredPoints ?? kpis.uncoveredPointCodes?.length ?? 0,
            exceedsWorkday: kpis.exceedsWorkday?.optimized ?? false,
            workdayHours: kpis.workdayHours ?? 12,
            simulationId: snapshot.result.simulationId ?? null,
          },
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
    const plan = withCalendarDays(await approveWeeklyPlan(state.plan.id, { referenceSimulationId }));
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
    const weekStart = mondayIso();
    setState('plan', {
      id: 0,
      weekStartDate: weekStart,
      weekEndDate: addDaysToIso(weekStart, 6),
      status: 'draft',
      scenarioId: 'normal',
      days: mergeWeekCalendarDays(weekStart, days),
    });
    return;
  }
  setState('plan', 'days', mergeWeekCalendarDays(state.plan.weekStartDate, days));
  setState({ validationCompleted: false, validationSummary: null });
}

export function updateWeeklyPlanDay(weekdayIndex: number, patch: Partial<WeeklyPlanDay>): void {
  if (!state.plan) return;
  const days = mergeWeekCalendarDays(state.plan.weekStartDate, state.plan.days);
  const current = days[weekdayIndex];
  if (!current) return;
  days[weekdayIndex] = { ...current, ...patch };
  setWeeklyPlanDays(days);
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

export async function autofillWeeklyFromCaseStudy(caseStudyId?: number | null): Promise<void> {
  if (!state.plan?.id) {
    throw new Error('Guarda un borrador antes de autocompletar');
  }
  const resolvedCaseId = caseStudyId ?? state.plan.caseStudyId ?? state.draftCaseStudy?.id;
  if (resolvedCaseId == null) {
    throw new Error('Selecciona un caso de estudio para autocompletar');
  }
  setState({ isSaving: true, error: null, notice: null });
  try {
    const plan = withCalendarDays(await autofillWeeklyPlanFromCaseStudy(state.plan.id, resolvedCaseId));
    await refreshWeeklyPlanHistory();
    setState({
      plan,
      validationCompleted: false,
      validationSummary: null,
      notice: `Días laborables configurados desde el caso ${plan?.caseStudyCode ?? ''}.`.trim(),
    });
  } catch (error) {
    setState({
      error: error instanceof Error ? error.message : 'No se pudo autocompletar desde el caso',
    });
    throw error;
  } finally {
    setState({ isSaving: false });
  }
}

export async function autofillWeeklyFromSchedules(): Promise<void> {
  if (!state.plan?.id) {
    throw new Error('Guarda un borrador antes de autocompletar');
  }
  const before = summarizeWeeklyPlanAssignment(
    mergeWeekCalendarDays(state.plan.weekStartDate, state.plan.days ?? []),
  );
  setState({ isSaving: true, error: null, notice: null });
  try {
    const plan = withCalendarDays(await autofillWeeklyPlanFromSchedules(state.plan.id));
    await refreshWeeklyPlanHistory();
    const after = summarizeWeeklyPlanAssignment(plan?.days ?? []);
    setState({
      plan,
      validationCompleted: false,
      validationSummary: null,
      notice: `Se asignaron ${after.pointCount} puntos en ${after.activeDays} días (antes: ${before.pointCount} puntos en ${before.activeDays} días).`,
    });
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
