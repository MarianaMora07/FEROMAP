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

export type { KpiMetrics };
