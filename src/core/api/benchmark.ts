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

export interface AcoSensitivityRun {
  label: string;
  scenarioId: string;
  acoAnts: number;
  acoIterations: number;
  axis: 'ants' | 'iterations';
  computationSeconds?: number;
  distanceKmOptimized?: number;
  acoIterationsRun?: number;
  savingPct?: number;
  error?: string;
}

export interface AcoSensitivityPayload {
  generatedAt: string;
  durationSeconds: number;
  scenarioId: string;
  standardProfile: { acoAnts: number; acoIterations: number };
  runs: AcoSensitivityRun[];
}

export function fetchAcoSensitivity(): Promise<AcoSensitivityPayload> {
  if (useMocks) {
    return Promise.resolve({
      generatedAt: new Date().toISOString(),
      durationSeconds: 48,
      scenarioId: 'normal',
      standardProfile: { acoAnts: 12, acoIterations: 20 },
      runs: [
        {
          label: '8 hormigas',
          scenarioId: 'normal',
          acoAnts: 8,
          acoIterations: 20,
          axis: 'ants',
          computationSeconds: 6.2,
          distanceKmOptimized: 31.4,
          acoIterationsRun: 20,
        },
        {
          label: '12 hormigas (estándar)',
          scenarioId: 'normal',
          acoAnts: 12,
          acoIterations: 20,
          axis: 'ants',
          computationSeconds: 8.1,
          distanceKmOptimized: 31.1,
          acoIterationsRun: 20,
        },
        {
          label: '20 hormigas',
          scenarioId: 'normal',
          acoAnts: 20,
          acoIterations: 20,
          axis: 'ants',
          computationSeconds: 11.4,
          distanceKmOptimized: 30.9,
          acoIterationsRun: 20,
        },
      ],
    });
  }
  return apiGet<AcoSensitivityPayload>('/api/v1/benchmarks/aco/sensitivity');
}

export function runAcoSensitivity(): Promise<AcoSensitivityPayload> {
  if (useMocks) return fetchAcoSensitivity();
  return apiPost<AcoSensitivityPayload>('/api/v1/benchmarks/aco/sensitivity', {});
}

export type { AcoConvergencePoint };
