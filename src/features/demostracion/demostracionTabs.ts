export type DemostracionTabId = 'concepto' | 'laberinto' | 'convergencia';

export interface DemostracionTabDef {
  id: DemostracionTabId;
  label: string;
  description: string;
}

export const DEMOSTRACION_TABS: DemostracionTabDef[] = [
  {
    id: 'concepto',
    label: 'Cómo funciona',
    description: 'Conceptos del algoritmo ACO y parámetros del proyecto.',
  },
  {
    id: 'laberinto',
    label: 'Laberinto',
    description: 'Visualización interactiva con feromonas y hormigas.',
  },
  {
    id: 'convergencia',
    label: 'Convergencia',
    description: 'Curva de costo vs iteración y vínculo con el motor real.',
  },
];

export const DEMOSTRACION_DEFAULT_TAB: DemostracionTabId = 'laberinto';
