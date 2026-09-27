import type { CaseStudyDefaultParameters, CaseStudyStatus, ScenarioId } from '../../data/types/caseStudy';
import type { ResolvedDemandSource } from '../../data/types/caseStudy';
import type { ContainerCollection } from '../types/geo';
import { apiGet, apiPatch, apiPost, apiPut, withMockFallback } from './client';
import {
  mockCaseStudyDetails,
  mockCaseStudyGeoJson,
  mockCaseStudyListResponse,
} from '../../data/mock/caseStudies';

export interface CaseStudyListItem {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  defaultScenarioId: ScenarioId;
  defaultParameters: CaseStudyDefaultParameters;
  status: CaseStudyStatus;
  activePointCount: number;
  pointCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CaseStudyPointRow {
  collectionPointId: number;
  code: string;
  sectorName?: string | null;
  activeInStudy: boolean;
  fillLevelKgOverride?: number | null;
  demandKgOverride?: number | null;
  resolvedDemandKg: number;
  resolvedFillLevelKg: number;
  demandSource: ResolvedDemandSource;
  catalogFillLevelPct: number;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface CaseStudyDetail extends CaseStudyListItem {
  points: CaseStudyPointRow[];
}

export interface CaseStudyListResponse {
  items: CaseStudyListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CaseStudyCreatePayload {
  code: string;
  name: string;
  description?: string | null;
  defaultScenarioId?: ScenarioId;
  defaultParameters?: CaseStudyDefaultParameters;
  status?: CaseStudyStatus;
}

export interface CaseStudyUpdatePayload {
  name?: string;
  description?: string | null;
  defaultScenarioId?: ScenarioId;
  defaultParameters?: CaseStudyDefaultParameters;
  status?: CaseStudyStatus;
}

export interface CaseStudyPointInput {
  collectionPointId: number;
  activeInStudy?: boolean;
  fillLevelKgOverride?: number | null;
  demandKgOverride?: number | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface CaseStudyPointOverridePayload {
  activeInStudy?: boolean;
  fillLevelKgOverride?: number | null;
  demandKgOverride?: number | null;
  notes?: string | null;
  sortOrder?: number | null;
}

export interface CaseStudyDuplicatePayload {
  code?: string;
  name?: string;
}

export interface CaseStudyGeoJson extends ContainerCollection {
  properties?: {
    caseStudyId: number;
    caseStudyCode: string;
    featureCount: number;
  };
}

function buildListQuery(
  status?: CaseStudyStatus,
  limit = 25,
  offset = 0,
  demoOnly = false,
): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (demoOnly) params.set('demoOnly', 'true');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchCaseStudies(
  options?: { status?: CaseStudyStatus; limit?: number; offset?: number; demoOnly?: boolean },
): Promise<CaseStudyListResponse> {
  const { status, limit = 25, offset = 0, demoOnly = false } = options ?? {};
  return withMockFallback(
    'case-studies-list',
    () => apiGet<CaseStudyListResponse>(`/api/v1/case-studies${buildListQuery(status, limit, offset, demoOnly)}`),
    mockCaseStudyListResponse,
  );
}

export function fetchCaseStudyDetail(caseStudyId: number): Promise<CaseStudyDetail> {
  return withMockFallback(
    'case-study-detail',
    () => apiGet<CaseStudyDetail>(`/api/v1/case-studies/${caseStudyId}`),
    mockCaseStudyDetails[caseStudyId] ?? mockCaseStudyDetails[1]!,
  );
}

export function fetchCaseStudyGeoJson(caseStudyId: number): Promise<CaseStudyGeoJson> {
  return withMockFallback(
    'case-study-geojson',
    () => apiGet<CaseStudyGeoJson>(`/api/v1/case-studies/${caseStudyId}/geojson`),
    mockCaseStudyGeoJson,
  );
}

export function createCaseStudy(payload: CaseStudyCreatePayload): Promise<CaseStudyDetail> {
  return apiPost<CaseStudyDetail>('/api/v1/case-studies', payload);
}

export function updateCaseStudy(caseStudyId: number, payload: CaseStudyUpdatePayload): Promise<CaseStudyDetail> {
  return apiPatch<CaseStudyDetail>(`/api/v1/case-studies/${caseStudyId}`, payload);
}

export function replaceCaseStudyPoints(
  caseStudyId: number,
  points: CaseStudyPointInput[],
): Promise<CaseStudyDetail> {
  return apiPut<CaseStudyDetail>(`/api/v1/case-studies/${caseStudyId}/points`, { points });
}

export function patchCaseStudyPoint(
  caseStudyId: number,
  collectionPointId: number,
  payload: CaseStudyPointOverridePayload,
): Promise<CaseStudyPointRow> {
  return apiPatch<CaseStudyPointRow>(
    `/api/v1/case-studies/${caseStudyId}/points/${collectionPointId}`,
    payload,
  );
}

export function duplicateCaseStudy(
  caseStudyId: number,
  payload: CaseStudyDuplicatePayload = {},
): Promise<CaseStudyDetail> {
  return apiPost<CaseStudyDetail>(`/api/v1/case-studies/${caseStudyId}/duplicate`, payload);
}
