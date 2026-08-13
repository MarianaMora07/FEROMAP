import { describe, expect, it } from 'vitest';
import { themeBaseStyleId, unareLocalStyle } from './mapStyleConfig';

describe('mapStyle', () => {
  it('usa Unare local como estilo operativo por defecto', () => {
    expect(themeBaseStyleId(false)).toBe('unare-local');
    expect(themeBaseStyleId(true)).toBe('unare-local');
  });

  it('apunta tiles locales al endpoint del backend', () => {
    const source = unareLocalStyle.sources['base-tiles'] as { tiles: string[] };
    expect(source.tiles[0]).toContain('/api/v1/map/tiles/{z}/{x}/{y}.png');
  });
});
