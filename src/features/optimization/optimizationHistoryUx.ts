import type { ScenarioId } from '../../data/types/simulation';
import { scenarios } from '../../data/mock/kpis';

export function resolveScenarioLabel(
  scenarioId?: ScenarioId | string | null,
  scenarioName?: string | null,
): string {
  if (scenarioName) return scenarioName;
  if (!scenarioId) return '—';
  return scenarios.find((scenario) => scenario.id === scenarioId)?.label ?? String(scenarioId);
}

export function formatOperationalSavingPct(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value);
  if (rounded > 0) return `−${rounded}%`;
  if (rounded < 0) return `+${Math.abs(rounded)}%`;
  return '0%';
}
