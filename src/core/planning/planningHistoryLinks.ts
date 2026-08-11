export interface PlanningHistoryLinkParams {
  weekStart?: string;
  operationDate?: string;
  incidentId?: number;
}

export function planningHistoryHref(params: PlanningHistoryLinkParams): string {
  const search = new URLSearchParams();
  if (params.weekStart) search.set('weekStart', params.weekStart);
  if (params.operationDate) search.set('operationDate', params.operationDate);
  if (params.incidentId != null) search.set('incidentId', String(params.incidentId));
  const query = search.toString();
  return query ? `/planning/history?${query}` : '/planning/history';
}
