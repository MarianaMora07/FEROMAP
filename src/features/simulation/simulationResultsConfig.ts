export const simulationResultsTabs = [
  { id: 'summary', label: 'Resumen' },
  { id: 'map', label: 'Mapa y recorrido' },
  { id: 'operations', label: 'Detalle operativo' },
  { id: 'engine', label: 'Motor' },
] as const;

export type SimulationResultsTabId = (typeof simulationResultsTabs)[number]['id'];

export const DEFAULT_SIMULATION_RESULTS_TAB: SimulationResultsTabId = 'summary';
