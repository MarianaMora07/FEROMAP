import { describe, expect, it } from 'vitest';
import type { DashboardSectorFill } from '../../core/api/dashboard';
import { rankZonesByAttention, zoneAttentionHref } from './zoneAttentionUx';

function zone(
  name: string,
  pct: number,
  criticalCount: number,
  overflowCount: number,
): DashboardSectorFill {
  return { name, pct, criticalCount, overflowCount };
}

describe('rankZonesByAttention', () => {
  it('prioriza críticos, luego rebose y luego llenado medio', () => {
    const zones = [
      zone('Pocos críticos', 95, 1, 0),
      zone('Muchos críticos', 70, 9, 0),
      zone('Empate de críticos con rebose', 60, 9, 4),
      zone('Sin críticos pero lleno', 98, 0, 0),
    ];

    expect(rankZonesByAttention(zones).map((item) => item.name)).toEqual([
      'Empate de críticos con rebose',
      'Muchos críticos',
      'Pocos críticos',
      'Sin críticos pero lleno',
    ]);
  });

  it('respeta el límite y no muta la entrada', () => {
    const zones = [zone('A', 10, 1, 0), zone('B', 20, 2, 0), zone('C', 30, 3, 0)];
    const snapshot = zones.map((item) => ({ ...item }));

    expect(rankZonesByAttention(zones, 2).map((item) => item.name)).toEqual(['C', 'B']);
    expect(zones).toEqual(snapshot);
  });

  it('desempata alfabéticamente para un orden estable', () => {
    const zones = [zone('Zona B', 50, 2, 1), zone('Zona A', 50, 2, 1)];

    expect(rankZonesByAttention(zones).map((item) => item.name)).toEqual(['Zona A', 'Zona B']);
  });

  it('tolera un payload antiguo sin conteos', () => {
    const stale = [{ name: 'Zona antigua', pct: 40 } as DashboardSectorFill];

    expect(rankZonesByAttention(stale).map((item) => item.name)).toEqual(['Zona antigua']);
  });
});

describe('zoneAttentionHref', () => {
  it('codifica el nombre de la zona en el deep link', () => {
    expect(zoneAttentionHref('Río Caura')).toBe('/collection-points?sector=R%C3%ADo%20Caura');
  });
});
