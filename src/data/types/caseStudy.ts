/**
 * Contrato de casos de estudio aislados (ADR-005).
 * @see docs/fase-12/adr-casos-estudio.md
 */

export const CASE_STUDY_CODE_MAX_LEN = 64;
export const CASE_STUDY_NAME_MAX_LEN = 255;
export const DEFAULT_CASE_STUDY_SCENARIO_ID = 'normal';

export const VALID_CASE_STUDY_STATUSES = ['draft', 'active', 'archived'] as const;
export type CaseStudyStatus = (typeof VALID_CASE_STUDY_STATUSES)[number];

export const VALID_SCENARIO_IDS = [
  'normal',
  'peak_traffic',
  'rain',
  'saturated',
  'broken_vehicle',
] as const;
export type ScenarioId = (typeof VALID_SCENARIO_IDS)[number];

/** Fuente para armar la instancia VRP (prioridad ADR-005 §3). */
export type OptimizationPointSource = 'case_study' | 'collection_point_ids' | 'all_active';

export interface CaseStudyDefaultParameters {
  operatorsShortage?: number;
  acoAnts?: number;
  acoIterations?: number;
  priorityFillLevel?: boolean;
  timeWindowEnabled?: boolean;
  estimatedDurationHours?: number;
  rainIntensity?: string;
  wasteLevelPct?: number;
}

export interface CaseStudyPointMembership {
  collectionPointId: number;
  activeInStudy?: boolean;
  fillLevelKgOverride?: number | null;
  demandKgOverride?: number | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface CaseStudyRecord {
  id?: number | null;
  code: string;
  name: string;
  description?: string | null;
  defaultScenarioId?: ScenarioId;
  defaultParameters?: CaseStudyDefaultParameters;
  status?: CaseStudyStatus;
  pointMemberships?: CaseStudyPointMembership[];
}

export interface CatalogPointSnapshot {
  collectionPointId: number;
  maxCapacityKg: number;
  currentFillLevelKg: number;
  status?: string;
}

export type ResolvedDemandSource = 'catalog' | 'fill_override' | 'demand_override';

export interface ResolvedStudyPoint {
  collectionPointId: number;
  demandKg: number;
  fillLevelKg: number;
  source: ResolvedDemandSource;
}

export interface OptimizationPointResolution {
  source: OptimizationPointSource;
  collectionPointIds: number[] | null;
}

export function normalizeCaseStudyCode(raw: string): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/_/g, '-')
    .split(/\s+/)
    .filter(Boolean)
    .join('-');
  if (!cleaned) throw new Error('case study code vacío');
  if (cleaned.length > CASE_STUDY_CODE_MAX_LEN) {
    throw new Error(`case study code excede ${CASE_STUDY_CODE_MAX_LEN} caracteres`);
  }
  return cleaned;
}

export function normalizeCaseStudyStatus(value?: string | null): CaseStudyStatus {
  const normalized = (value ?? 'draft').trim().toLowerCase();
  if (!(VALID_CASE_STUDY_STATUSES as readonly string[]).includes(normalized)) {
    throw new Error(`status inválido: ${value ?? ''}`);
  }
  return normalized as CaseStudyStatus;
}

export function normalizeDefaultScenarioId(value?: string | null): ScenarioId {
  const normalized = (value ?? DEFAULT_CASE_STUDY_SCENARIO_ID).trim().toLowerCase();
  if (!(VALID_SCENARIO_IDS as readonly string[]).includes(normalized)) {
    throw new Error(`scenario_id inválido: ${value ?? ''}`);
  }
  return normalized as ScenarioId;
}

export function activeCaseStudyPointIds(memberships: CaseStudyPointMembership[]): number[] {
  return memberships
    .filter((m) => m.activeInStudy !== false && m.collectionPointId > 0)
    .map((m) => m.collectionPointId)
    .sort((a, b) => a - b);
}

export function resolveOptimizationPointSource(params: {
  caseStudyId?: number | null;
  caseStudyPointIds?: number[] | null;
  requestCollectionPointIds?: number[] | null;
}): OptimizationPointResolution {
  const { caseStudyId, caseStudyPointIds, requestCollectionPointIds } = params;

  if (caseStudyId != null && caseStudyPointIds != null) {
    const caseSet = new Set(caseStudyPointIds);
    if (requestCollectionPointIds?.length) {
      const intersection = [...new Set(requestCollectionPointIds.filter((id) => caseSet.has(id)))].sort(
        (a, b) => a - b,
      );
      if (!intersection.length) {
        throw new Error('intersección vacía entre caso de estudio y collectionPointIds');
      }
      return { source: 'case_study', collectionPointIds: intersection };
    }
    const active = [...caseSet].sort((a, b) => a - b);
    if (!active.length) throw new Error('el caso de estudio no tiene puntos activos');
    return { source: 'case_study', collectionPointIds: active };
  }

  if (requestCollectionPointIds?.length) {
    const ids = [...new Set(requestCollectionPointIds)].sort((a, b) => a - b);
    if (!ids.length) throw new Error('collectionPointIds vacío');
    return { source: 'collection_point_ids', collectionPointIds: ids };
  }

  return { source: 'all_active', collectionPointIds: null };
}

export function resolvePointDemandKg(
  catalog: CatalogPointSnapshot,
  membership?: CaseStudyPointMembership | null,
): ResolvedStudyPoint {
  const cap = Math.max(0, catalog.maxCapacityKg);
  const catalogFill = Math.max(0, Math.min(cap, catalog.currentFillLevelKg));

  if (membership?.demandKgOverride != null) {
    const demand = Math.max(0, membership.demandKgOverride);
    return {
      collectionPointId: catalog.collectionPointId,
      demandKg: demand,
      fillLevelKg: Math.min(cap, demand),
      source: 'demand_override',
    };
  }

  if (membership?.fillLevelKgOverride != null) {
    const fill = Math.max(0, Math.min(cap, membership.fillLevelKgOverride));
    return {
      collectionPointId: catalog.collectionPointId,
      demandKg: fill,
      fillLevelKg: fill,
      source: 'fill_override',
    };
  }

  return {
    collectionPointId: catalog.collectionPointId,
    demandKg: catalogFill,
    fillLevelKg: catalogFill,
    source: 'catalog',
  };
}

export function caseStudyContextForSimulation(record: CaseStudyRecord): Record<string, unknown> {
  const memberships = record.pointMemberships ?? [];
  return {
    caseStudyId: record.id ?? null,
    caseStudyCode: record.code,
    caseStudyName: record.name,
    defaultScenarioId: record.defaultScenarioId ?? DEFAULT_CASE_STUDY_SCENARIO_ID,
    defaultParameters: record.defaultParameters ?? {},
    activePointCount: activeCaseStudyPointIds(memberships).length,
  };
}

/** Matriz documentada ADR-005: caso ≠ escenario climático. */
export const CASE_STUDY_OBJECTIVE_MATRIX = {
  caseStudy: { points: true, localOverrides: true, trafficWeather: false },
  scenarioId: { points: false, localOverrides: false, trafficWeather: true },
} as const;
