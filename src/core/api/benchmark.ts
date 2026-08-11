import type { AcoConvergencePoint } from '../../data/types/simulation';
import { apiGet, apiPost, useMocks } from './client';
import { mockAcoBenchmark } from '../../data/mock/benchmark';

export interface AcoBenchmarkRun {
  scenarioId: string;
  scenarioLabel: string;
  profileId: string;
  profileLabel: string;
  acoAnts: number;
  acoIterations: number;
  computationSeconds?: number;
  graphLoadSeconds?: number;
  acoSeconds?: number;
  overheadSeconds?: number;
  savingPct?: number;
  distanceKmOptimized?: number;
  acoIterationsRun?: number;
  acoStoppedEarly?: boolean;
  matrixCacheHit?: boolean;
  matrixCacheIncremental?: boolean;
  error?: string;
}

export interface AcoBenchmarkPayload {
  generatedAt: string;
  durationSeconds: number;
  scenarioCount: number;
  profileCount: number;
  runs: AcoBenchmarkRun[];
}

export function fetchAcoBenchmark(): Promise<AcoBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAcoBenchmark);
  return apiGet<AcoBenchmarkPayload>('/api/v1/benchmarks/aco');
}

export function runAcoBenchmark(): Promise<AcoBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAcoBenchmark);
  return apiPost<AcoBenchmarkPayload>('/api/v1/benchmarks/aco', {});
}

export type { AcoConvergencePoint };
