import { globalToast } from '../../core/stores/toastStore';
import { SettingsShell } from './SettingsShell';
import { AlgorithmSettingsPanel } from './AlgorithmSettingsPanel';

/**
 * Página «Configuración» (sidebar) — sección **Algoritmo**.
 *
 * Centraliza los parámetros del sistema (motor ACO y objetivo multiobjetivo, Fase 13);
 * antes vivía como pestaña dentro de *Plan del día*. La consola de calibración es la otra
 * sección de esta misma página (`/settings/calibration`).
 *
 * El feedback de guardado usa el toast global (patrón único de éxito/error, Fase 4).
 */
export default function SettingsPage() {
  const flashMessage = (message: string) => {
    globalToast.addToast(message, 'success');
  };

  return (
    <SettingsShell active="algorithm">
      <AlgorithmSettingsPanel onFlash={flashMessage} />
    </SettingsShell>
  );
}
