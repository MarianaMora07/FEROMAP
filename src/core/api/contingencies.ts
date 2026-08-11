import type { KpiMetrics } from '../../data/types/simulation';
import { apiGet, apiPost } from './client';
import type { OptimizeResponse } from './simulation';

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

export function reportVehicleBreakdown(
  payload: VehicleBreakdownRequest,
): Promise<VehicleBreakdownResponse> {
  return apiPost<VehicleBreakdownResponse>('/api/v1/contingencies/vehicle-breakdown', payload);
}

export function fetchRecentIncidents(): Promise<IncidentPayload[]> {
  return apiGet<IncidentPayload[]>('/api/v1/contingencies/recent');
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

export function recalcCriticalContainer(
  payload: CriticalContainerRecalcRequest,
): Promise<CriticalContainerRecalcResponse> {
  return apiPost<CriticalContainerRecalcResponse>('/api/v1/contingencies/critical-container-recalc', payload);
}

export type { KpiMetrics };
