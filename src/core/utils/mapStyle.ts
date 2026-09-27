import { createEffect } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { appState } from '../stores/appStore';
import { mapStyleForTheme } from './mapStyleConfig';

export {
  mapStyleForTheme,
  resolveMapStyle,
  mapStylesById,
  osmMapStyle,
  themeBaseStyleId,
  unareLocalStyle,
} from './mapStyleConfig';

export function setMapThemeStyle(
  map: MapLibreMap,
  darkMode: boolean,
  onRestored: () => void,
): void {
  map.setStyle(mapStyleForTheme(darkMode));
  map.once('style.load', () => {
    map.resize();
    onRestored();
  });
}

/** Reaplica el estilo claro/oscuro cuando cambia el tema global de la app. */
export function bindMapTheme(
  getMap: () => MapLibreMap | undefined,
  isReady: () => boolean,
  restoreLayers: () => void,
): void {
  let skipFirst = true;
  createEffect(() => {
    const _dark = appState.darkMode;
    const map = getMap();
    if (!map || !isReady()) return;
    if (skipFirst) {
      skipFirst = false;
      return;
    }
    setMapThemeStyle(map, appState.darkMode, restoreLayers);
  });
}
