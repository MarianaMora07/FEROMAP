import { createSignal } from 'solid-js';
import { SettingsShell } from './SettingsShell';
import { AlgorithmSettingsPanel } from './AlgorithmSettingsPanel';

/**
 * Página «Configuración» (sidebar) — sección **Algoritmo**.
 *
 * Centraliza los parámetros del sistema (motor ACO y objetivo multiobjetivo, Fase 13);
 * antes vivía como pestaña dentro de *Plan del día*. La consola de calibración es la otra
 * sección de esta misma página (`/settings/calibration`).
 */
export default function SettingsPage() {
  const [flash, setFlash] = createSignal<string | null>(null);

  const flashMessage = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((current) => (current === message ? null : current)), 2500);
  };

  return (
    <SettingsShell active="algorithm" flash={flash()}>
      <AlgorithmSettingsPanel onFlash={flashMessage} />
    </SettingsShell>
  );
}
