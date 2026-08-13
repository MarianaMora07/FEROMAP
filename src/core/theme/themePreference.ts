export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'feromap.theme.preference';

const VALID_THEMES = new Set<ThemePreference>(['light', 'dark', 'system']);

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value != null && VALID_THEMES.has(value as ThemePreference);
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // ignore storage errors
  }
  return 'system';
}

export function persistThemePreference(theme: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors
  }
}

export function resolveDarkMode(theme: ThemePreference): boolean {
  if (typeof window === 'undefined') return false;
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

/** Aplica clase `dark` en `<html>` según preferencia resuelta. */
export function applyThemeToDocument(theme: ThemePreference): boolean {
  const dark = resolveDarkMode(theme);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark);
  }
  return dark;
}
