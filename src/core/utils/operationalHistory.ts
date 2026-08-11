import { fetchSimulationHistory, type SimulationHistoryRow } from '../api/simulationOperations';

const OPERATIONAL_HISTORY_KEY = 'feromap:operational-history';
const MAX_OPERATIONAL_ENTRIES = 25;

function readOperationalRunIds(): number[] {
  try {
    const raw = localStorage.getItem(OPERATIONAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === 'number' && id > 0);
  } catch {
    return [];
  }
}

function writeOperationalRunIds(ids: number[]): void {
  localStorage.setItem(OPERATIONAL_HISTORY_KEY, JSON.stringify(ids.slice(0, MAX_OPERATIONAL_ENTRIES)));
}

/** Registra una ejecución iniciada desde Planificación operativa (no desde Simulación). */
export function recordOperationalRun(simulationId: number): void {
  if (!Number.isFinite(simulationId) || simulationId <= 0) return;
  const ids = readOperationalRunIds().filter((id) => id !== simulationId);
  writeOperationalRunIds([simulationId, ...ids]);
}

/** Historial filtrado: solo corridas originadas en /optimization. */
export async function fetchOperationalHistory(): Promise<SimulationHistoryRow[]> {
  const ids = readOperationalRunIds();
  if (ids.length === 0) return [];

  const all = await fetchSimulationHistory();
  const byId = new Map(all.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is SimulationHistoryRow => row != null);
}
