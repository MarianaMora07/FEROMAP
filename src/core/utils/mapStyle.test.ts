import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mapStyleForTheme,
  resetMapStyleCache,
  resolveMapStyle,
  themeBaseStyleId,
  unareLocalStyle,
} from './mapStyleConfig';

describe('mapStyle', () => {
  afterEach(() => {
    resetMapStyleCache();
    vi.unstubAllGlobals();
  });

  it('usa Unare local como estilo operativo por defecto', () => {
    expect(themeBaseStyleId(false)).toBe('unare-local');
    expect(themeBaseStyleId(true)).toBe('unare-local');
  });

  it('apunta tiles locales al endpoint del backend', () => {
    const source = unareLocalStyle.sources['base-tiles'] as { tiles: string[] };
    expect(source.tiles[0]).toContain('/api/v1/map/tiles/{z}/{x}/{y}.png');
  });

  it('cae a OSM si el backend no tiene MBTiles Unare', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ available: false }),
      }),
    );

    const style = await resolveMapStyle(false);
    const source = style.sources['base-tiles'] as { tiles: string[] };
    expect(source.tiles[0]).toContain('tile.openstreetmap.org');
    expect(mapStyleForTheme(false)).toBe(style);
  });
});
