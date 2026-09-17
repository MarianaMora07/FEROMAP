import { describe, expect, it } from 'vitest';
import type { DashboardAtRiskContainer } from '../../core/api/dashboard';
import {
  mostUrgentRisk,
  riskCoverageText,
  riskFooterText,
  visitSourceLabel,
} from './riskSummaryUx';

function item(overrides: Partial<DashboardAtRiskContainer>): DashboardAtRiskContainer {
  return {
    id: 'CNT-000',
    sector: 'Unare I',
    fillLevel: 50,
    hoursUntilCritical: 10,
    hoursUntilNextVisit: 30,
    visitSource: 'agenda',
    visitDate: '2026-09-18',
    ...overrides,
  };
}

describe('mostUrgentRisk', () => {
  it('elige el que antes cruza el umbral', () => {
    const items = [
      item({ id: 'A', hoursUntilCritical: 20 }),
      item({ id: 'B', hoursUntilCritical: 5.9 }),
    ];

    expect(mostUrgentRisk(items)?.id).toBe('B');
  });

  it('ignora los que no tienen horas estimadas', () => {
    const items = [
      item({ id: 'A', hoursUntilCritical: null }),
      item({ id: 'B', hoursUntilCritical: 12 }),
    ];

    expect(mostUrgentRisk(items)?.id).toBe('B');
  });

  it('devuelve null sin candidatos', () => {
    expect(mostUrgentRisk([item({ hoursUntilCritical: null })])).toBeNull();
    expect(mostUrgentRisk([])).toBeNull();
  });
});

describe('visitSourceLabel', () => {
  it('etiqueta el plan con su fecha y la agenda con la suya', () => {
    expect(visitSourceLabel(item({ visitSource: 'plan', visitDate: '2026-09-23' }))).toBe(
      ' (plan 23/09)',
    );
    expect(visitSourceLabel(item({ visitSource: 'agenda', visitDate: '2026-09-18' }))).toBe(
      ' (agenda 18/09)',
    );
  });

  it('no inventa etiqueta si el backend no informa la fuente', () => {
    expect(visitSourceLabel(item({ visitSource: undefined, visitDate: undefined }))).toBe('');
  });
});

describe('riskFooterText', () => {
  it('separa la urgencia de llenado de la fecha y la fuente de recolección', () => {
    const items = [
      item({ id: 'CNT-131', hoursUntilCritical: 5.44, hoursUntilNextVisit: 33.9 }),
    ];

    expect(riskFooterText(items)).toBe(
      'CNT-131: cruza el umbral en 5.4 h · recolección en 33.9 h (agenda 18/09)',
    );
  });

  it('distingue cuando la fecha viene del plan aprobado', () => {
    const items = [
      item({
        id: 'CNT-093',
        hoursUntilCritical: 5.9,
        hoursUntilNextVisit: 154.1,
        visitSource: 'plan',
        visitDate: '2026-09-23',
      }),
    ];

    expect(riskFooterText(items)).toBe(
      'CNT-093: cruza el umbral en 5.9 h · recolección en 154.1 h (plan 23/09)',
    );
  });

  it('omite la recolección cuando no se conoce', () => {
    const items = [item({ id: 'CNT-093', hoursUntilCritical: 5.9, hoursUntilNextVisit: null })];

    expect(riskFooterText(items)).toBe('CNT-093: cruza el umbral en 5.9 h');
  });

  it('no promete cifras si ningún contenedor tiene proyección', () => {
    expect(riskFooterText([item({ hoursUntilCritical: null })])).toBe(
      'Se llenarán antes de su próxima recolección',
    );
  });

  it('avisa cuando no hay contenedores en riesgo', () => {
    expect(riskFooterText([])).toBe('Ninguno se llenará antes de su próxima visita');
  });
});

describe('riskCoverageText', () => {
  it('declara de qué fuente sale la fecha de los evaluables', () => {
    expect(
      riskCoverageText({ evaluable: 100, unevaluated: 0, fromPlan: 0, fromAgenda: 100 }),
    ).toBe('100 evaluables · 100 según agenda');
  });

  it('muestra las dos fuentes cuando están mezcladas', () => {
    expect(
      riskCoverageText({ evaluable: 100, unevaluated: 2, fromPlan: 40, fromAgenda: 60 }),
    ).toBe('100 evaluables · 40 según plan · 60 según agenda · 2 sin recolección programada');
  });

  it('singulariza un único evaluable', () => {
    expect(riskCoverageText({ evaluable: 1, unevaluated: 0, fromPlan: 1, fromAgenda: 0 })).toBe(
      '1 evaluable · 1 según plan',
    );
  });
});
