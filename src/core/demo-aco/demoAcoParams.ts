/**
 * Parámetros del ACO documentados para la demostración didáctica.
 * Valores alineados con el motor de producción en backend.
 *
 * @see backend/app/services/optimization_service.py — `_aco_cvrp`, evaporación y depósito
 * @see backend/app/services/aco_parallel.py — `_pick_candidate`, α y β
 * @see backend/app/config.py — defaults por entorno y límites UI
 */

/** Importancia de la feromona en la selección (τ^α). */
export const DEMO_ACO_ALPHA = 1.0;

/** Importancia de la heurística de distancia (η^β), η = 1/distancia. */
export const DEMO_ACO_BETA = 3.0;

/** Tasa de evaporación ρ: τ ← (1−ρ)τ en cada iteración. */
export const DEMO_ACO_RHO = 0.12;

/** Iteraciones sin mejora antes de parada anticipada (`0` = desactivado). */
export const DEMO_ACO_PATIENCE = 5;

/** Constante de depósito Q en producción: τ += Q/costo con Q = 1. */
export const DEMO_ACO_DEPOSIT_Q = 1;

export type DemoAcoEnvId = 'local' | 'staging' | 'production';

export interface DemoAcoServerDefaults {
  env: DemoAcoEnvId;
  label: string;
  ants: number;
  iterations: number;
}

/** Defaults del servidor según `APP_ENV` (config.py). */
export const DEMO_ACO_SERVER_DEFAULTS: DemoAcoServerDefaults[] = [
  { env: 'local', label: 'Local (desarrollo)', ants: 6, iterations: 10 },
  { env: 'staging', label: 'Staging / producción', ants: 12, iterations: 20 },
  { env: 'production', label: 'Staging / producción', ants: 12, iterations: 20 },
];

/** Perfiles expuestos en la UI de simulación (`simulationConfig.ts`). */
export const DEMO_ACO_UI_PRESETS = [
  { id: 'fast', label: 'Rápido', ants: 6, iterations: 10 },
  { id: 'standard', label: 'Estándar', ants: 12, iterations: 20 },
  { id: 'precise', label: 'Preciso', ants: 20, iterations: 40 },
] as const;

export const DEMO_ACO_LIMITS = {
  antsMin: 4,
  antsMax: 30,
  iterationsMin: 5,
  iterationsMax: 60,
} as const;

export interface DemoAcoParamRow {
  symbol: string;
  name: string;
  value: string;
  role: string;
  source: string;
}

/** Tabla de parámetros para el panel didáctico (valores reales del proyecto). */
export const DEMO_ACO_PARAM_TABLE: DemoAcoParamRow[] = [
  {
    symbol: 'α',
    name: 'Alpha',
    value: String(DEMO_ACO_ALPHA),
    role: 'Peso de la feromona en la probabilidad de elección',
    source: 'aco_parallel.py · optimization_service.py',
  },
  {
    symbol: 'β',
    name: 'Beta',
    value: String(DEMO_ACO_BETA),
    role: 'Peso de la heurística η = 1/distancia',
    source: 'aco_parallel.py · optimization_service.py',
  },
  {
    symbol: 'ρ',
    name: 'Rho (evaporación)',
    value: String(DEMO_ACO_RHO),
    role: 'Evaporación global: τ ← (1−ρ)τ cada iteración',
    source: 'optimization_service.py',
  },
  {
    symbol: 'Q',
    name: 'Depósito',
    value: String(DEMO_ACO_DEPOSIT_Q),
    role: 'Incremento τ += Q/costo en aristas de la mejor ruta',
    source: 'optimization_service.py',
  },
  {
    symbol: '—',
    name: 'Inicialización τ',
    value: '1 / distancia',
    role: 'Matriz de feromonas al inicio del algoritmo',
    source: 'optimization_service.py',
  },
  {
    symbol: 'N',
    name: 'Hormigas / iteración',
    value: '6 (local) · 12 (prod) · 4–30 (UI)',
    role: 'Soluciones construidas en paralelo por iteración',
    source: 'config.py · scenario_parameters.py',
  },
  {
    symbol: 'I',
    name: 'Iteraciones máx.',
    value: '10 (local) · 20 (prod) · 5–60 (UI)',
    role: 'Ciclos de construcción + actualización de feromonas',
    source: 'config.py · scenario_parameters.py',
  },
  {
    symbol: '—',
    name: 'Paciencia',
    value: String(DEMO_ACO_PATIENCE),
    role: 'Parada si no hay mejora en N iteraciones consecutivas',
    source: 'config.py · optimization_service.py',
  },
  {
    symbol: '—',
    name: 'Paralelismo',
    value: 'Auto (CPUs−1)',
    role: 'Hormigas evaluadas en procesos worker',
    source: 'aco_parallel.py · ACO_PARALLEL_WORKERS',
  },
];

/** Fórmula de probabilidad usada en `_pick_candidate`. */
export const DEMO_ACO_SELECTION_FORMULA = 'P(i→j) ∝ τᵢⱼ^α · ηᵢⱼ^β';

/** Evaporación y depósito (texto para UI). */
export const DEMO_ACO_PHEROMONE_RULES = {
  evaporation: 'τᵢⱼ ← (1 − ρ) · τᵢⱼ',
  deposit: 'τᵢⱼ ← τᵢⱼ + Q / costo_mejor_ruta',
} as const;

/** Referencias de código para enlaces internos en documentación. */
export const DEMO_ACO_CODE_REFERENCES = {
  mainLoop: 'backend/app/services/optimization_service.py — `_aco_cvrp`',
  antPick: 'backend/app/services/aco_parallel.py — `_pick_candidate`',
  config: 'backend/app/config.py',
} as const;
