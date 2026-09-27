import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getStoredThemePreference,
  isThemePreference,
  persistThemePreference,
  resolveDarkMode,
  THEME_STORAGE_KEY,
} from './themePreference';

function mockBrowserStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('themePreference', () => {
  beforeEach(() => {
    mockBrowserStorage();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recognizes valid theme values', () => {
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('neon')).toBe(false);
  });

  it('defaults to system when storage is empty', () => {
    expect(getStoredThemePreference()).toBe('system');
  });

  it('reads and writes localStorage', () => {
    persistThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(getStoredThemePreference()).toBe('dark');
  });

  it('resolves explicit dark theme', () => {
    expect(resolveDarkMode('dark')).toBe(true);
    expect(resolveDarkMode('light')).toBe(false);
  });

  it('resolves system theme from matchMedia', () => {
    mockMatchMedia(true);
    expect(resolveDarkMode('system')).toBe(true);
  });
});
