export function parseSimulationIdParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function simulationResultsHref(simulationId?: number | null): string {
  if (!simulationId) return '/simulation';
  return `/simulation?simulationId=${simulationId}`;
}

export function simulationHistoryHref(): string {
  return '/simulation?view=history';
}

export function analyticsHref(simulationId?: number | null): string {
  if (!simulationId) return '/analytics';
  return `/analytics?simulationId=${simulationId}`;
}

export function reportsHref(simulationId?: number | null): string {
  if (!simulationId) return '/reports';
  return `/reports?simulationId=${simulationId}`;
}
