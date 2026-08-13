import { describe, expect, it } from 'vitest';
import { FERO_THEME_TOKENS } from './themeTokens';

describe('FERO theme tokens (Fase 0 palette)', () => {
  it('defines integrated dark sidebar navy', () => {
    expect(FERO_THEME_TOKENS.dark.bgSidebar).toBe('#0b1220');
    expect(FERO_THEME_TOKENS.dark.sidebarBorder).toBe('#334155');
  });

  it('keeps brand blue sidebar in light mode', () => {
    expect(FERO_THEME_TOKENS.light.bgSidebar).toBe('#232AB6');
  });

  it('uses FERO green for active nav in both modes', () => {
    expect(FERO_THEME_TOKENS.light.navActiveBg).toBe('#34D634');
    expect(FERO_THEME_TOKENS.dark.navActiveBg).toBe('#34D634');
  });

  it('uses navy text on active nav pill in both modes (AA on green)', () => {
    expect(FERO_THEME_TOKENS.light.navActiveText).toBe('#0b1220');
    expect(FERO_THEME_TOKENS.dark.navActiveText).toBe('#0b1220');
  });

  it('aligns app and elevated surfaces with slate scale', () => {
    expect(FERO_THEME_TOKENS.dark.bgApp).toBe('#0f172a');
    expect(FERO_THEME_TOKENS.dark.bgElevated).toBe('#1e293b');
  });
});
