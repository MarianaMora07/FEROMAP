import type { KpiMetrics } from '../../data/types/simulation';
import { apiGet, apiPost } from './client';
import type { OptimizeResponse } from './simulation';
import { fetchSimulationOptimizeJob } from './simulationJobs';

const CONTINGENCY_JOB_POLL_MS = 450;
const CONTINGENCY_JOB_MAX_WAIT_MS = 20 * 60 * 1000;

async function awaitContingencyJob<T>(jobId: string): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < CONTINGENCY_JOB_MAX_WAIT_MS) {
    const snapshot = await fetchSimulationOptimizeJob(jobId);
    if (snapshot.status === 'completed' && snapshot.result) {
      return snapshot.result as unknown as T;
    }
    if (snapshot.status === 'failed') {
      throw new Error(snapshot.error ?? 'El recálculo de contingencia falló en el servidor');
    }
    if (snapshot.status === 'cancelled') {
      throw new Error('El recálculo de contingencia fue cancelado');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, CONTINGENCY_JOB_POLL_MS));
  }
  throw new Error('El recálculo de contingencia tardó más de 20 minutos');
}

export interface VehicleBreakdownRequest {
  vehicleId: string;
  routeId?: number;
  description?: string;
}

export interface IncidentPayload {
  id: number;
  vehicleId: string;
  vehicleDbId: number;
  routeId: number | null;
  incidentType: string;
  description: string | null;
  reportedAt: string | null;
  affectsActiveRoute: boolean;
  relatedAlertId?: string | null;
}

export interface ContingencyComparison {
  parentSimulationId: number | null;
  beforeDistanceKm: number;
  afterDistanceKm: number;
  distanceDeltaKm: number;
  remainingVehicles: number;
  reassignedPoints: number;
}

export interface VehicleBreakdownResponse {
  incident: IncidentPayload;
  skippedWaypoints: number;
  pendingPoints: number;
  recalculation: OptimizeResponse | null;
  comparison?: ContingencyComparison;
  message: string;
}

export async function reportVehicleBreakdown(
  payload: VehicleBreakdownRequest,
): Promise<VehicleBreakdownResponse> {
  const { jobId } = await apiPost<{ jobId: string; status: string }>(
    '/api/v1/contingencies/vehicle-breakdown',
    payload,
  );
  return awaitContingencyJob<VehicleBreakdownResponse>(jobId);
}

export function fetchRecentIncidents(params?: {
  vehicleId?: string;
  hours?: number;
  limit?: number;
}): Promise<IncidentPayload[]> {
  const query = new URLSearchParams();
  if (params?.vehicleId) query.set('vehicleId', params.vehicleId);
  if (params?.hours != null) query.set('hours', String(params.hours));
  if (params?.limit != null) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiGet<IncidentPayload[]>(`/api/v1/contingencies/recent${suffix}`);
}

export interface CriticalContainerRecalcRequest {
  collectionPointCode: string;
  dailyPlanId?: number;
  operationDate?: string;
}

export interface CriticalContainerRecalcResponse {
  collectionPoint: { code: string; fillLevel: number; id: number };
  dailyPlanId: number;
  operationDate: string;
  remainingPoints: number;
  recalculation: OptimizeResponse | null;
  notifications: Array<{ id: number; eventType: string; message?: string }>;
  message: string;
}

export async function recalcCriticalContainer(
  payload: CriticalContainerRecalcRequest,
): Promise<CriticalContainerRecalcResponse> {
  const { jobId } = await apiPost<{ jobId: string; status: string }>(
    '/api/v1/contingencies/critical-container-recalc',
    payload,
  );
  return awaitContingencyJob<CriticalContainerRecalcResponse>(jobId);
}

export type { KpiMetrics };
