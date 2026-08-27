import { apiGet } from '../api/client';
import { fetchSimulationHistory, type SimulationHistoryRow } from '../api/simulationOperations';

export interface OperationalHistoryRow extends SimulationHistoryRow {
  dailyPlanId?: number;
  operationDate?: string;
  status?: string;
  pointCount?: number;
  distanceKm?: number;
  scenarioName?: string;
}

/** Historial administrativo desde API (planificación diaria con simulation_id). */
export async function fetchOperationalHistory(): Promise<OperationalHistoryRow[]> {
  try {
    const response = await apiGet<{ items: OperationalHistoryRow[] }>('/api/v1/planning/operational-history');
    if (response.items.length > 0) {
      return response.items;
    }
  } catch {
    // fallback below
  }
  const all = await fetchSimulationHistory();
  return all.filter((row) => !row.contingency).slice(0, 25);
}

/** Compatibilidad: ya no persiste IDs en localStorage. */
export function recordOperationalRun(_simulationId: number): void {
  // Historial administrativo proviene de daily_plans en el backend.
}
