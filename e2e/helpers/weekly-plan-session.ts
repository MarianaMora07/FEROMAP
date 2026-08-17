import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL, PLAN_EMAIL, PLAN_PASSWORD } from './planner-session';

function mondayIso(reference = new Date()): string {
  const date = new Date(reference);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addWeeksToMonday(weekStartIso: string, weeks: number): string {
  const date = new Date(`${weekStartIso}T12:00:00`);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

async function plannerAuthHeaders(request: APIRequestContext) {
  const res = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email: PLAN_EMAIL, password: PLAN_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`No se pudo autenticar planificador: ${res.status()}`);
  }
  const body = (await res.json()) as { accessToken: string };
  return {
    Authorization: `Bearer ${body.accessToken}`,
    'Content-Type': 'application/json',
  };
}

interface WeeklyPlanListItem {
  id: number;
  status: string;
  weekStartDate: string;
}

export async function ensureWeeklyDraftPlan(request: APIRequestContext): Promise<number> {
  const headers = await plannerAuthHeaders(request);
  const listRes = await request.get(`${API_URL}/api/v1/planning/weekly`, { headers });
  if (!listRes.ok()) {
    throw new Error(`No se pudo listar planes semanales: ${listRes.status()}`);
  }
  const { items } = (await listRes.json()) as { items: WeeklyPlanListItem[] };
  const draft = items.find((plan) => plan.status === 'draft');
  if (draft) return draft.id;

  const occupied = new Set(items.map((plan) => plan.weekStartDate));
  let weekStart = mondayIso();
  for (let week = 0; week < 12; week += 1) {
    if (!occupied.has(weekStart)) break;
    weekStart = addWeeksToMonday(weekStart, 1);
  }

  const pointsRes = await request.get(`${API_URL}/api/v1/collection-points?limit=30`, { headers });
  const pointsBody = (await pointsRes.json()) as {
    features?: Array<{ properties?: { id?: number | string } }>;
    items?: Array<{ id: number }>;
  };
  const rawIds =
    pointsBody.features?.map((feature) => Number(feature.properties?.id)) ??
    pointsBody.items?.map((point) => point.id) ??
    [];
  const pointIds = rawIds.filter((id) => Number.isFinite(id) && id > 0).slice(0, 20);
  if (pointIds.length === 0) {
    throw new Error('No hay puntos de recolección para crear un borrador semanal');
  }

  const days = Array.from({ length: 5 }, (_, offset) => {
    const date = new Date(`${weekStart}T12:00:00`);
    date.setDate(date.getDate() + offset);
    const chunk = Math.max(1, Math.ceil(pointIds.length / 5));
    return {
      operationDate: date.toISOString().slice(0, 10),
      collectionPointIds: pointIds.slice(offset * chunk, (offset + 1) * chunk),
    };
  });

  const createRes = await request.post(`${API_URL}/api/v1/planning/weekly`, {
    headers,
    data: {
      weekStartDate: weekStart,
      scenarioId: 'normal',
      days,
    },
  });

  if (createRes.ok()) {
    const plan = (await createRes.json()) as { id: number };
    return plan.id;
  }

  const retryRes = await request.get(`${API_URL}/api/v1/planning/weekly`, { headers });
  const retryItems = ((await retryRes.json()) as { items: WeeklyPlanListItem[] }).items;
  const existingDraft = retryItems.find((plan) => plan.status === 'draft');
  if (existingDraft) return existingDraft.id;

  throw new Error(`No se pudo crear borrador semanal: ${await createRes.text()}`);
}

export async function selectDraftWeeklyPlan(page: Page, request: APIRequestContext) {
  await expect(page.getByTestId('weekly-plan-list')).toBeVisible({ timeout: 15_000 });

  const draftRow = page.locator('[data-weekly-plan-status="draft"]').first();
  if (!(await draftRow.isVisible())) {
    const planId = await ensureWeeklyDraftPlan(request);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('planning-weekly-page')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('weekly-plan-list')).toBeVisible({ timeout: 15_000 });
    await page.locator(`[data-testid="weekly-plan-row-${planId}"] [role="button"]`).click();
    return;
  }

  await draftRow.locator('[role="button"]').click();
}

export async function autofillIfNeeded(page: Page) {
  const autofillButton = page.getByRole('button', { name: 'Autocompletar desde frecuencias' });
  if (await autofillButton.isVisible()) {
    await autofillButton.click();
    await expect(page.getByText(/Se asignaron \d+ puntos en \d+ días/)).toBeVisible({ timeout: 30_000 });
  }
}
