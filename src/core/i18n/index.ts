/**
 * i18n base (F8): estado de locale + traducción.
 *
 * Módulo deliberadamente sin dependencias de framework para poder testearse en
 * Node. La reactividad en componentes se logra con `onLocaleChange` (ver
 * `useLocaleTick` en `./solid`).
 */

import { DICTIONARIES, es, type MessageKey } from './dictionaries';

export type Locale = 'es' | 'en' | 'pt';

export const SUPPORTED_LOCALES: readonly Locale[] = ['es', 'en', 'pt'];
export const DEFAULT_LOCALE: Locale = 'es';

const STORAGE_KEY = 'feromap.locale';

type Listener = () => void;
const listeners = new Set<Listener>();

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (SUPPORTED_LOCALES as readonly string[]).includes(normalized)
    ? (normalized as Locale)
    : null;
}

function readInitialLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
  return normalizeLocale(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_LOCALE;
}

let currentLocale: Locale = readInitialLocale();

export function getLocale(): Locale {
  return currentLocale;
}

/** Cambia el locale activo y notifica a los suscriptores. Valores inválidos → ES. */
export function setLocale(value: string | null | undefined): void {
  const next = normalizeLocale(value) ?? DEFAULT_LOCALE;
  if (next === currentLocale) return;
  currentLocale = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage puede no estar disponible (modo privado); se ignora.
    }
  }
  for (const listener of listeners) listener();
}

export function onLocaleChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Traduce con respaldo en cascada: locale → ES → fallback → clave. */
export function translate(locale: Locale, key: string, fallback?: string): string {
  const dictionary = DICTIONARIES[locale as keyof typeof DICTIONARIES] as
    | Record<string, string>
    | undefined;
  const value = dictionary?.[key] ?? es[key as MessageKey];
  return value ?? fallback ?? key;
}

export function t(key: string, fallback?: string): string {
  return translate(currentLocale, key, fallback);
}

export { DICTIONARIES, es, en, type MessageKey } from './dictionaries';
