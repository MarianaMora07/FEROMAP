export interface OperationalLinkParams {
  date?: string;
  dailyPlanId?: number;
}

export function monitoringHref(params: OperationalLinkParams = {}): string {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.dailyPlanId != null) search.set('dailyPlanId', String(params.dailyPlanId));
  const query = search.toString();
  return query ? `/monitoring?${query}` : '/monitoring';
}

export function optimizationHref(params: OperationalLinkParams = {}): string {
  const search = new URLSearchParams();
  if (params.date) search.set('date', params.date);
  if (params.dailyPlanId != null) search.set('dailyPlanId', String(params.dailyPlanId));
  const query = search.toString();
  return query ? `/optimization?${query}` : '/optimization';
}
