/**
 * i18n base (F8): estado de locale + traducción.
 *
 * Módulo deliberadamente sin dependencias de framework para poder testearse en
 * Node. La reactividad en componentes se logra con `onLocaleChange` (ver
 * `useLocaleTick` en `./solid`).
 */

import { DICTIONARIES, es, type MessageKey } from './dictionaries';

/**
 * Locales soportados.
 *
 * `pt` se retiró en Fase 0 (decisión D-0.1, ver
 * `docs/design-system/contratos-ui.md`): se ofrecía en el selector de idioma
 * pero no existía diccionario, por lo que la opción caía silenciosamente a ES.
 * Una preferencia `pt` ya guardada en el perfil/localStorage se normaliza a ES.
 */
export type Locale = 'es' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['es', 'en'];
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

/** Dirección de escritura por locale (ES/EN son LTR; el mapa queda listo para futuros RTL). */
const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = { es: 'ltr', en: 'ltr' };

/** Refleja el locale activo en `<html lang>` y `<html dir>` (lectores de pantalla, SEO). */
function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = LOCALE_DIR[locale];
}

applyDocumentLocale(currentLocale);

export function getLocale(): Locale {
  return currentLocale;
}

/** Cambia el locale activo y notifica a los suscriptores. Valores inválidos → ES. */
export function setLocale(value: string | null | undefined): void {
  const next = normalizeLocale(value) ?? DEFAULT_LOCALE;
  // `<html lang>`/`dir` reflejan el idioma activo aunque no cambie (sincronización con el perfil).
  applyDocumentLocale(next);
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
