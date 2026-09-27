import { expect, type APIRequestContext } from '@playwright/test';

import { API_URL, PLAN_EMAIL, PLAN_PASSWORD } from './planner-session';
import { OPERATOR_EMAIL, OPERATOR_PASSWORD } from './operator-session';
import { RESIDENT_EMAIL, RESIDENT_PASSWORD } from './resident-session';

export const CASE_STUDY_CODE = 'CE-UNARE-NORTE';
const JOB_TIMEOUT_MS = 300_000;
const JOB_POLL_MS = 1_000;

export interface PhaseAFlowResult {
  weekStart: string;
  operationDate: string;
  weeklyPlanId: number;
  dailyPlanId: number;
  operatorStops: number;
  residentHasWeeklyPlan: boolean;
}

function mondayIso(reference = new Date()): string {
  const date = new Date(reference);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function pickOperationDate(weekStartIso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(`${weekStartIso}T12:00:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const todayDate = new Date(`${today}T12:00:00`);
  if (todayDate >= weekStart && todayDate <= weekEnd) {
    const weekday = todayDate.getDay();
    if (weekday > 0 && weekday < 6) return today;
  }
  return weekStartIso;
}

async function authHeaders(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `Login falló para ${email}`).toBeTruthy();
  const body = (await res.json()) as { accessToken: string };
  return {
    Authorization: `Bearer ${body.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function waitForJob(request: APIRequestContext, headers: Record<string, string>, jobId: string) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let view: { status: string; result?: unknown; error?: string } = { status: 'pending' };
  while (!['completed', 'failed', 'cancelled'].includes(view.status) && Date.now() < deadline) {
    const res = await request.get(`${API_URL}/api/v1/simulations/jobs/${jobId}`, { headers });
    expect(res.ok()).toBeTruthy();
    view = (await res.json()) as typeof view;
    if (!['completed', 'failed', 'cancelled'].includes(view.status)) {
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
    }
  }
  expect(view.status, view.error ?? 'job no completó').toBe('completed');
  return view;
}

export async function runPhaseAFlowViaApi(request: APIRequestContext): Promise<PhaseAFlowResult> {
  const headers = await authHeaders(request, PLAN_EMAIL, PLAN_PASSWORD);
  const weekStart = mondayIso();
  const operationDate = pickOperationDate(weekStart);

  const casesRes = await request.get(`${API_URL}/api/v1/case-studies?limit=50`, { headers });
  expect(casesRes.ok()).toBeTruthy();
  const casesBody = (await casesRes.json()) as { items: Array<{ id: number; code: string }> };
  const caseStudy = casesBody.items.find((row) => row.code === CASE_STUDY_CODE);
  expect(caseStudy, `Falta caso ${CASE_STUDY_CODE}`).toBeTruthy();

  const listRes = await request.get(`${API_URL}/api/v1/planning/weekly`, { headers });
  expect(listRes.ok()).toBeTruthy();
  const listBody = (await listRes.json()) as {
    items: Array<{ id: number; weekStartDate: string; status: string }>;
  };
  const existing = listBody.items.find((plan) => plan.weekStartDate === weekStart);

  let planId: number;
  if (existing) {
    if (existing.status === 'approved') {
      throw new Error(
        'Plan semanal aprobado para la semana actual. Ejecuta: just phase-a-flow (pytest) primero.',
      );
    }
    planId = existing.id;
  } else {
    const createRes = await request.post(`${API_URL}/api/v1/planning/weekly`, {
      headers,
      data: {
        weekStartDate: weekStart,
        scenarioId: 'normal',
        caseStudyId: caseStudy!.id,
        days: [],
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    planId = ((await createRes.json()) as { id: number }).id;
  }

  const autofillRes = await request.post(
    `${API_URL}/api/v1/planning/weekly/${planId}/autofill-from-case-study?caseStudyId=${caseStudy!.id}`,
    { headers },
  );
  expect(autofillRes.ok(), await autofillRes.text()).toBeTruthy();
  const weekly = (await autofillRes.json()) as {
    id: number;
    caseStudyCode: string;
    days: Array<{ operationDate: string; collectionPointIds: number[] }>;
  };
  expect(weekly.caseStudyCode).toBe(CASE_STUDY_CODE);
  expect(weekly.days.length).toBe(5);
  for (const day of weekly.days) {
    expect(day.collectionPointIds.length).toBe(15);
  }

  const validateRes = await request.post(`${API_URL}/api/v1/planning/weekly/${planId}/validate`, {
    headers,
  });
  expect(validateRes.ok()).toBeTruthy();
  const validateBody = (await validateRes.json()) as { jobId: string };
  const validationJob = await waitForJob(request, headers, validateBody.jobId);
  const simulationId = (validationJob.result as { simulationId: number }).simulationId;

  const approveRes = await request.post(`${API_URL}/api/v1/planning/weekly/${planId}/approve`, {
    headers,
    data: { referenceSimulationId: simulationId },
  });
  expect(approveRes.ok(), await approveRes.text()).toBeTruthy();

  const dailyRes = await request.get(`${API_URL}/api/v1/planning/daily/${operationDate}`, { headers });
  expect(dailyRes.ok()).toBeTruthy();
  const dailyPlanId = ((await dailyRes.json()) as { id: number }).id;

  const optimizeRes = await request.post(`${API_URL}/api/v1/planning/daily/${dailyPlanId}/optimize`, {
    headers,
    data: {},
  });
  expect(optimizeRes.ok(), await optimizeRes.text()).toBeTruthy();
  const optimizeBody = (await optimizeRes.json()) as { jobId: string };
  await waitForJob(request, headers, optimizeBody.jobId);

  const dispatchRes = await request.post(`${API_URL}/api/v1/planning/daily/${dailyPlanId}/dispatch`, {
    headers,
  });
  expect(dispatchRes.ok(), await dispatchRes.text()).toBeTruthy();

  const operatorHeaders = await authHeaders(request, OPERATOR_EMAIL, OPERATOR_PASSWORD);
  const operatorRes = await request.get(
    `${API_URL}/api/v1/planning/operator-snapshot?operationDate=${operationDate}`,
    { headers: operatorHeaders },
  );
  expect(operatorRes.ok()).toBeTruthy();
  const operatorSnapshot = (await operatorRes.json()) as {
    dailyPlanStatus: string | null;
    stopsTotal: number;
  };
  expect(operatorSnapshot.dailyPlanStatus).toBe('dispatched');
  expect(operatorSnapshot.stopsTotal).toBeGreaterThan(0);

  const residentHeaders = await authHeaders(request, RESIDENT_EMAIL, RESIDENT_PASSWORD);
  const residentRes = await request.get(`${API_URL}/api/v1/resident/overview`, {
    headers: residentHeaders,
  });
  expect(residentRes.ok()).toBeTruthy();
  const residentBody = (await residentRes.json()) as {
    schedule: { hasWeeklyPlan: boolean; source: string };
  };
  expect(residentBody.schedule.hasWeeklyPlan).toBe(true);
  expect(residentBody.schedule.source).toBe('weekly_plan');

  return {
    weekStart,
    operationDate,
    weeklyPlanId: planId,
    dailyPlanId,
    operatorStops: operatorSnapshot.stopsTotal,
    residentHasWeeklyPlan: residentBody.schedule.hasWeeklyPlan,
  };
}
