import { createContext, useContext } from 'solid-js';
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface OperationalMapContextValue {
  map: () => MapLibreMap | undefined;
  mapReady: () => boolean;
}

export const OperationalMapContext = createContext<OperationalMapContextValue>();

export function useOperationalMap(): OperationalMapContextValue {
  const context = useContext(OperationalMapContext);
  if (!context) {
    throw new Error('useOperationalMap must be used within <OperationalMap>');
  }
  return context;
}
