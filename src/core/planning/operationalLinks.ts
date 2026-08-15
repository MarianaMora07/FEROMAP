export interface OperationalLinkParams {
  date?: string;
  dailyPlanId?: number;
  vehicleId?: string;
  playback?: boolean;
}

export function operationalMapHref(params: { focus?: 'routes' | 'route' | 'next'; date?: string } = {}): string {
  const search = new URLSearchParams();
  if (params.focus) search.set('focus', params.focus);
  if (params.date) search.set('date', params.date);
  const query = search.toString();
  return query ? `/map?${query}` : '/map';
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

export function optimizationPlaybackHref(params: OperationalLinkParams = {}): string {
  return optimizationHref({ ...params, playback: true });
}

export function monitoringPlaybackHref(params: OperationalLinkParams = {}): string {
  return monitoringHref({ ...params, playback: true });
}
