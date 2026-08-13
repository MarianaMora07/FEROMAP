export interface OperatorDeepLinkParams {
  date?: string;
  vehicleId?: string;
  dailyPlanId?: number;
  focus?: 'route' | 'next';
  scope?: 'mine';
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function operatorMonitoringHref(params: OperatorDeepLinkParams = {}): string {
  return `/monitoring${buildQuery({
    date: params.date,
    vehicleId: params.vehicleId,
    dailyPlanId: params.dailyPlanId != null ? String(params.dailyPlanId) : undefined,
  })}`;
}

export function operatorMapHref(params: OperatorDeepLinkParams = {}): string {
  return `/map${buildQuery({
    date: params.date,
    vehicleId: params.vehicleId,
    focus: params.focus,
  })}`;
}

export function operatorAlertsHref(params: OperatorDeepLinkParams = {}): string {
  return `/alerts${buildQuery({
    scope: params.scope ?? 'mine',
    vehicleId: params.vehicleId,
  })}`;
}

export function parseVehicleIdParam(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return undefined;
  return raw.trim().toUpperCase();
}
