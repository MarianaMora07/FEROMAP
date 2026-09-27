export interface ResidentDeepLinkParams {
  focus?: 'truck' | 'sector' | 'routes';
  sectorId?: number | string;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function residentMapHref(params: ResidentDeepLinkParams = {}): string {
  return `/map${buildQuery({
    scope: 'sector',
    focus: params.focus ?? 'sector',
    sectorId: params.sectorId != null ? String(params.sectorId) : undefined,
  })}`;
}

export function residentAlertsHref(): string {
  return '/alerts?scope=sector';
}

export function residentHubHref(): string {
  return '/resident';
}

export function residentPointsHref(): string {
  return '/collection-points';
}

export function residentHubScheduleHref(): string {
  return '/resident#horario-recoleccion';
}
