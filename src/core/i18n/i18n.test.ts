import { describe, expect, it } from 'vitest';
import { en, es } from './dictionaries';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getLocale,
  onLocaleChange,
  setLocale,
  t,
  translate,
} from './index';

describe('i18n — diccionarios y traducción (F8)', () => {
  it('es y en exponen exactamente las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('traduce por locale', () => {
    expect(translate('es', 'nav.weekly')).toBe('Plan semanal');
    expect(translate('en', 'nav.weekly')).toBe('Weekly plan');
  });

  it('solo soporta es/en; una preferencia pt guardada cae a ES (Fase 0)', () => {
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en']);
    setLocale('pt');
    expect(getLocale()).toBe(DEFAULT_LOCALE);
  });

  it('devuelve el fallback y luego la clave si no existe traducción', () => {
    expect(translate('en', 'no.existe', 'Respaldo')).toBe('Respaldo');
    expect(translate('en', 'no.existe')).toBe('no.existe');
  });

  it('setLocale normaliza valores inválidos al locale por defecto', () => {
    expect(getLocale()).toBe(DEFAULT_LOCALE);
    setLocale('en');
    expect(getLocale()).toBe('en');
    setLocale('klingon');
    expect(getLocale()).toBe(DEFAULT_LOCALE);
    expect(t('nav.weekly')).toBe('Plan semanal');
  });

  it('notifica a los suscriptores al cambiar el locale', () => {
    let calls = 0;
    const unsubscribe = onLocaleChange(() => {
      calls += 1;
    });
    setLocale('en');
    unsubscribe();
    setLocale('es');
    expect(calls).toBe(1);
  });
});
