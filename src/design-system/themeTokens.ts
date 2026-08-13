/**
 * Valores acordados en Fase 0 — paleta modo oscuro integrado.
 * Deben coincidir con :root / html.dark en tokens.css.
 */
export const FERO_THEME_TOKENS = {
  light: {
    bgApp: '#f8fafc',
    bgElevated: '#ffffff',
    bgSidebar: '#232AB6',
    bgSidebarElevated: 'rgba(255, 255, 255, 0.1)',
    borderDefault: '#e2e8f0',
    textPrimary: '#0f172a',
    textMuted: '#94a3b8',
    navActiveBg: '#34D634',
    navActiveText: '#0b1220',
    navHoverBg: 'rgba(255, 255, 255, 0.1)',
    navText: 'rgba(255, 255, 255, 0.65)',
    navTextMuted: 'rgba(255, 255, 255, 0.4)',
    navSection: 'rgba(255, 255, 255, 0.35)',
    sidebarBorder: 'transparent',
  },
  dark: {
    bgApp: '#0f172a',
    bgElevated: '#1e293b',
    bgSidebar: '#0b1220',
    bgSidebarElevated: '#111827',
    borderDefault: '#334155',
    textPrimary: '#f1f5f9',
    textMuted: '#94a3b8',
    navActiveBg: '#34D634',
    navActiveText: '#0b1220',
    navHoverBg: '#1e293b',
    navText: '#cbd5e1',
    navTextMuted: '#64748b',
    navSection: '#475569',
    sidebarBorder: '#334155',
  },
  brand: {
    feroGreen: '#93F555',
    feroGreenMid: '#56E93D',
    feroGreenDark: '#34D634',
    logoMap: '#93F555',
    logoFero: '#ffffff',
  },
} as const;

export type FeroThemeMode = keyof typeof FERO_THEME_TOKENS;
