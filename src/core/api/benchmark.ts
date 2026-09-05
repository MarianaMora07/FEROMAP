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

// --- Benchmark entre familias (ACO vs Clarke-Wright vs GA) — Tarea 6 --------

export interface AlgorithmsBenchmarkRun {
  scenarioId: string;
  scenarioLabel: string;
  instanceSize: number;
  seed: number;
  family: 'aco' | 'clarke_wright' | 'genetic';
  familyLabel: string;
  distanceKm: number;
  cpuSeconds: number;
  uncoveredCount: number;
  vehicles: number;
}

export interface AlgorithmsBenchmarkPayload {
  generatedAt: string;
  durationSeconds: number;
  methodology: string;
  scenarios: string[];
  instanceSizes: number[];
  seeds: number[];
  families: string[];
  runs: AlgorithmsBenchmarkRun[];
}

export function fetchAlgorithmsBenchmark(): Promise<AlgorithmsBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAlgorithmsBenchmark());
  return apiGet<AlgorithmsBenchmarkPayload>('/api/v1/benchmarks/algorithms');
}

export function runAlgorithmsBenchmark(): Promise<AlgorithmsBenchmarkPayload> {
  if (useMocks) return Promise.resolve(mockAlgorithmsBenchmark());
  return apiPost<AlgorithmsBenchmarkPayload>('/api/v1/benchmarks/algorithms', {});
}

function mockAlgorithmsBenchmark(): AlgorithmsBenchmarkPayload {
  const labels: Record<string, string> = {
    aco: 'ACO (12×20)',
    clarke_wright: 'Clarke-Wright',
    genetic: 'GA (34×70)',
  };
  const runs: AlgorithmsBenchmarkRun[] = [];
  const sizes = [15, 30, 60];
  for (const size of sizes) {
    let best = 0;
    for (const [index, family] of ['aco', 'clarke_wright', 'genetic'].entries()) {
      const factor = family === 'aco' ? 0.92 : family === 'genetic' ? 1.0 : 1.08;
      const base = 90 + size * 1.7;
      const distanceKm = Math.round(base * factor * 10) / 10;
      if (family === 'aco') best = distanceKm;
      runs.push({
        scenarioId: 'normal',
        scenarioLabel: 'Tráfico normal',
        instanceSize: size,
        seed: 101,
        family: family as AlgorithmsBenchmarkRun['family'],
        familyLabel: labels[family]!,
        distanceKm,
        cpuSeconds: Math.round(((family === 'aco' ? 3.2 : family === 'genetic' ? 2.1 : 0.1) + size / 40) * 100) / 100,
        uncoveredCount: 0,
        vehicles: index + 2,
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    durationSeconds: 0,
    methodology:
      'Instancias controladas del catálogo. No son rutas históricas: sirven para comparar familias sobre el mismo problema.',
    scenarios: ['normal'],
    instanceSizes: sizes,
    seeds: [101],
    families: ['aco', 'clarke_wright', 'genetic'],
    runs,
  };
}

export type { AcoConvergencePoint };
