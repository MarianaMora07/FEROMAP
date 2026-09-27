export interface OperationalLinkParams {
  date?: string;
  dailyPlanId?: number;
  vehicleId?: string;
  playback?: boolean;
  /** Escenario con el que reoptimizar el día en la simulación (p. ej. `rain`). */
  scenario?: string;
}

export function operationalMapHref(params: { focus?: 'routes' | 'route' | 'next'; date?: string } = {}): string {
  const search = new URLSearchParams();
  if (params.focus) search.set('focus', params.focus);
  if (params.date) search.set('date', params.date);
  const query = search.toString();
  return query ? `/map?${query}` : '/map';
}

export function mapPlaybackHref(params: OperationalLinkParams = {}): string {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.dailyPlanId != null) search.set('dailyPlanId', String(params.dailyPlanId));
  if (params.vehicleId) search.set('vehicleId', params.vehicleId);
  search.set('playback', '1');
  return `/map?${search.toString()}`;
}

export function monitoringHref(params: OperationalLinkParams = {}): string {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.dailyPlanId != null) search.set('dailyPlanId', String(params.dailyPlanId));
  if (params.vehicleId) search.set('vehicleId', params.vehicleId);
  if (params.playback) search.set('playback', '1');
  const query = search.toString();
  return query ? `/monitoring?${query}` : '/monitoring';
}

export function optimizationHref(params: OperationalLinkParams = {}): string {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.dailyPlanId != null) search.set('dailyPlanId', String(params.dailyPlanId));
  if (params.playback) search.set('playback', '1');
  const query = search.toString();
  return query ? `/optimization?${query}` : '/optimization';
}

export interface OptimizationQueryPatch {
  date?: string | null;
  dailyPlanId?: number | null;
  playback?: boolean | null;
  /** Pestaña de primer nivel: `plan` · `routes` · `results` · `pending`. */
  tab?: string | null;
}

/**
 * Construye una URL de `/optimization` preservando el query actual y aplicando un parche.
 * Permite navegar (p. ej. cambiar de día) sin perder la pestaña activa (P1, L) y sin duplicar la
 * lógica de construcción de query en cada llamador.
 */
export function optimizationHrefFrom(
  current: Record<string, string | string[] | undefined>,
  patch: OptimizationQueryPatch = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single != null && single !== '') search.set(key, single);
  }
  const apply = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    if (value === null || value === '') search.delete(key);
    else search.set(key, value);
  };
  apply('date', patch.date);
  apply('dailyPlanId', patch.dailyPlanId == null ? patch.dailyPlanId : String(patch.dailyPlanId));
  apply('playback', patch.playback == null ? patch.playback : '1');
  apply('tab', patch.tab);
  const query = search.toString();
  return query ? `/optimization?${query}` : '/optimization';
}

export function optimizationPlaybackHref(params: OperationalLinkParams = {}): string {
  return optimizationHref({ ...params, playback: true });
}

/** Vista propia de la simulación guionada del día (mapa protagonista). */
export type DaySimulationCondition = 'none' | 'all';

export function daySimulationHref(
  params: OperationalLinkParams & { condition?: DaySimulationCondition } = {},
): string {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.dailyPlanId != null) search.set('dailyPlanId', String(params.dailyPlanId));
  // `condition=none` reproduce solo el plan base; `all` incluye las contingencias guionadas.
  if (params.condition) search.set('condition', params.condition);
  // `scenario=rain` reoptimiza el día bajo ese escenario antes de guionar la secuencia.
  if (params.scenario) search.set('scenario', params.scenario);
  const query = search.toString();
  return query ? `/optimization/simulation?${query}` : '/optimization/simulation';
}

export function monitoringPlaybackHref(params: OperationalLinkParams = {}): string {
  return monitoringHref({ ...params, playback: true });
}
