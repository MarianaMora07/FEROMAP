import { describe, expect, it } from 'vitest';
import { FERO_THEME_TOKENS } from './themeTokens';
import { contrastRatio, meetsWcagAaNormalText } from '../core/theme/contrastUtils';

describe('sidebar active nav contrast (Fase 6 QA)', () => {
  it('dark mode: navy text on FERO green meets AA for normal text', () => {
    const { navActiveBg, navActiveText } = FERO_THEME_TOKENS.dark;
    expect(meetsWcagAaNormalText(navActiveText, navActiveBg)).toBe(true);
    expect(contrastRatio(navActiveText, navActiveBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('light mode: white text on FERO green meets AA for normal text', () => {
    const { navActiveBg, navActiveText } = FERO_THEME_TOKENS.light;
    expect(meetsWcagAaNormalText(navActiveText, navActiveBg)).toBe(true);
  });

  it('dark mode: nav label on sidebar navy meets AA large text', () => {
    const { bgSidebar, navText } = FERO_THEME_TOKENS.dark;
    expect(contrastRatio(navText, bgSidebar)).toBeGreaterThanOrEqual(3);
  });
});
