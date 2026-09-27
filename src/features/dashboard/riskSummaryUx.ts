import type { DashboardAtRiskContainer } from '../../core/api/dashboard';

/** Contenedor en riesgo con proyección conocida hasta el umbral. */
export type UrgentRiskContainer = DashboardAtRiskContainer & { hoursUntilCritical: number };

/** Contenedor en riesgo más urgente = el que antes cruza el umbral crítico. */
export function mostUrgentRisk(
  items: readonly DashboardAtRiskContainer[],
): UrgentRiskContainer | null {
  const withHours = items.filter(
    (item): item is UrgentRiskContainer => item.hoursUntilCritical != null,
  );
  if (withHours.length === 0) return null;
  return withHours.reduce((best, item) =>
    item.hoursUntilCritical < best.hoursUntilCritical ? item : best,
  );
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return day && month ? `${day}/${month}` : iso;
}

/**
 * Etiqueta del origen de la fecha (`(plan 23/09)` / `(agenda 18/09)`).
 *
 * Sin esto la cifra cambia de significado según qué fuente exista —lo que se
 * *programó* frente a lo que *tocaría* según la agenda— y el número parecía salir
 * de la nada.
 */
export function visitSourceLabel(item: DashboardAtRiskContainer): string {
  if (!item.visitSource) return '';
  const when = item.visitDate ? ` ${shortDate(item.visitDate)}` : '';
  return ` (${item.visitSource}${when})`;
}

/**
 * Pie de la tarjeta de riesgo. Separa las dos magnitudes que antes se confundían:
 * cuándo cruza el umbral el más urgente y cuándo es *su* recolección.
 */
export function riskFooterText(items: readonly DashboardAtRiskContainer[]): string {
  if (items.length === 0) return 'Ninguno se llenará antes de su próxima visita';

  const urgent = mostUrgentRisk(items);
  if (!urgent) return 'Se llenarán antes de su próxima recolección';

  const threshold = `cruza el umbral en ${urgent.hoursUntilCritical.toFixed(1)} h`;
  if (urgent.hoursUntilNextVisit == null) {
    return `${urgent.id}: ${threshold}`;
  }
  const visit = `recolección en ${urgent.hoursUntilNextVisit.toFixed(1)} h`;
  return `${urgent.id}: ${threshold} · ${visit}${visitSourceLabel(urgent)}`;
}

export interface RiskCoverageInput {
  evaluable: number;
  unevaluated: number;
  fromPlan: number;
  fromAgenda: number;
}

/** Línea de cobertura: qué se pudo evaluar, con qué fuente, y qué quedó fuera. */
export function riskCoverageText(input: RiskCoverageInput): string {
  const parts = [`${input.evaluable} evaluable${input.evaluable === 1 ? '' : 's'}`];
  if (input.fromPlan > 0) parts.push(`${input.fromPlan} según plan`);
  if (input.fromAgenda > 0) parts.push(`${input.fromAgenda} según agenda`);
  if (input.unevaluated > 0) {
    parts.push(`${input.unevaluated} sin recolección programada`);
  }
  return parts.join(' · ');
}
