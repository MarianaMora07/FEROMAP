import { createSignal, onCleanup } from 'solid-js';
import { onLocaleChange, t } from './index';

/**
 * Devuelve un traductor reactivo: al cambiar el locale, los componentes que lean
 * el texto se re-renderizan. Debe llamarse dentro de un componente (usa onCleanup).
 */
export function useLocale(): (key: string, fallback?: string) => string {
  const [tick, setTick] = createSignal(0);
  const unsubscribe = onLocaleChange(() => setTick((value) => value + 1));
  onCleanup(unsubscribe);
  return (key: string, fallback?: string) => {
    tick();
    return t(key, fallback);
  };
}
