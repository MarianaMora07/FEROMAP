/**
 * Contrato de fases de ejecución — Simulación (Fase 7.0).
 * Fuente única para stepper, narrativa, progreso simulado y animación de mapa.
 * Documentación: docs/fase-7/
 */

export type ExecutionPhaseId =
  | 'preparando'
  | 'grafo_vial'
  | 'matriz_costos'
  | 'instancia_vrp'
  | 'aco'
  | 'refinamiento_2opt'
  | 'persistencia'
  | 'preparando_mapa'
  | 'listo';

export type ExecutionTerminalPhaseId = 'cancelado' | 'error';

export type ExecutionStatus =
  | 'idle'
  | 'running'
  | 'listo'
  | 'cancelado'
  | 'error';

export type ExecutionMapAnimation =
  | 'none'
  | 'overlay_preparing'
  | 'sectors_fade'
  | 'cost_matrix_lines'
  | 'critical_pulse'
  | 'aco_explore'
  | 'two_opt_refine'
  | 'persist_spinner'
  | 'route_complete';

export interface ExecutionPhaseDefinition {
  id: ExecutionPhaseId;
  order: number;
  /** Etiqueta corta en stepper (sin siglas técnicas) */
  label: string;
  /** Título en panel de ejecución, p. ej. «Fase 5/8» */
  panelTitle: string;
  /** Explicación en lenguaje claro para el evaluador */
  whatItDoes: string;
  whyItMatters: string;
  /** Peso relativo para barra de progreso (suma = 100) */
  progressWeight: number;
  /** Duración sugerida en modo simulado (ms) — Fase 7.1+ */
  simulatedDurationMs: number;
  mapAnimation: ExecutionMapAnimation;
  /** Fragmentos para mapear logs backend/mock a esta fase */
  logMatchers: string[];
}

export const EXECUTION_PHASES: readonly ExecutionPhaseDefinition[] = [
  {
    id: 'preparando',
    order: 1,
    label: 'Preparando escenario',
    panelTitle: 'Preparando escenario',
    whatItDoes:
      'Reúne el escenario que elegiste, los camiones disponibles y los contenedores que entrarán al cálculo.',
    whyItMatters:
      'Así la simulación refleja las condiciones reales (lluvia, avería, saturación) antes de buscar rutas.',
    progressWeight: 5,
    simulatedDurationMs: 600,
    mapAnimation: 'overlay_preparing',
    logMatchers: ['iniciando optimización', 'inicializando'],
  },
  {
    id: 'grafo_vial',
    order: 2,
    label: 'Red de calles',
    panelTitle: 'Cargando red de calles',
    whatItDoes:
      'Carga el mapa de calles de Unare (datos abiertos OSM) donde circularán los camiones de recolección.',
    whyItMatters:
      'Las distancias se miden por calles reales, no en línea recta; así el ahorro de tiempo y combustible es creíble.',
    progressWeight: 10,
    simulatedDurationMs: 900,
    mapAnimation: 'sectors_fade',
    logMatchers: ['grafo', 'osmnx', 'osm', 'puntos de recolección', 'cargando 20'],
  },
  {
    id: 'matriz_costos',
    order: 3,
    label: 'Distancias y tiempos',
    panelTitle: 'Calculando distancias y tiempos',
    whatItDoes:
      'Calcula cuánto cuesta ir de un punto a otro siguiendo el camino más corto por la red de calles.',
    whyItMatters:
      'Sin esta tabla de costos el optimizador no puede comparar rutas ni elegir la más eficiente.',
    progressWeight: 15,
    simulatedDurationMs: 1100,
    mapAnimation: 'cost_matrix_lines',
    logMatchers: ['matriz de costos', 'networkx', 'shortest path', 'costos sobre red'],
  },
  {
    id: 'instancia_vrp',
    order: 4,
    label: 'Problema de rutas',
    panelTitle: 'Armando el problema de rutas (VRP)',
    whatItDoes:
      'Define quién recoge qué: cada camión con su capacidad y cada contenedor con su nivel de llenado (problema VRP).',
    whyItMatters:
      'Traduce la operación municipal a un modelo que el algoritmo puede resolver con reglas realistas.',
    progressWeight: 10,
    simulatedDurationMs: 800,
    mapAnimation: 'critical_pulse',
    logMatchers: ['instancia vrp', 'vehículos', 'demanda', 'críticos', 're-priorizando'],
  },
  {
    id: 'aco',
    order: 5,
    label: 'Búsqueda inteligente',
    panelTitle: 'Buscando mejores rutas (ACO)',
    whatItDoes:
      'Prueba muchas combinaciones de rutas con el algoritmo de colonia de hormigas (ACO) hasta acercarse a la mejor solución.',
    whyItMatters:
      'Es el núcleo de la tesis: reduce distancia, tiempo y combustible frente a la ruta actual del municipio.',
    progressWeight: 30,
    simulatedDurationMs: 3200,
    mapAnimation: 'aco_explore',
    logMatchers: ['aco', 'hormigas', 'metaheurística', 'evaluando', 'soluciones candidatas', 'iteración'],
  },
  {
    id: 'refinamiento_2opt',
    order: 6,
    label: 'Ajuste fino',
    panelTitle: 'Puliendo las rutas (2-opt)',
    whatItDoes:
      'Elimina recodos innecesarios en cada ruta con un ajuste local llamado 2-opt.',
    whyItMatters: 'La búsqueda encuentra buenas rutas; este paso las deja listas para mostrar al planificador.',
    progressWeight: 14,
    simulatedDurationMs: 1200,
    mapAnimation: 'two_opt_refine',
    logMatchers: ['2-opt', 'refin', 'convergente', 'optimizada:', 'tiempo en paradas'],
  },
  {
    id: 'persistencia',
    order: 7,
    label: 'Guardando resultados',
    panelTitle: 'Guardando resultados',
    whatItDoes:
      'Guarda la simulación, las rutas optimizadas y los puntos intermedios en la base de datos para el mapa.',
    whyItMatters:
      'Permite historial, comparar corridas y enlazar con analítica y reportes de la tesis.',
    progressWeight: 8,
    simulatedDurationMs: 700,
    mapAnimation: 'persist_spinner',
    logMatchers: ['persistiendo', 'postgresql', 'geojson', 'guardando'],
  },
  {
    id: 'preparando_mapa',
    order: 8,
    label: 'Preparando mapa',
    panelTitle: 'Preparando mapa',
    whatItDoes:
      'Carga las rutas en el mapa con la geometría vial que el servidor ya calculó sobre el grafo OSMnx de Unare (sin servicios externos).',
    whyItMatters:
      'El trazado en pantalla coincide con el que usó el optimizador; es instantáneo y funciona sin internet.',
    progressWeight: 6,
    simulatedDurationMs: 300,
    mapAnimation: 'route_complete',
    logMatchers: ['mapa', 'geometría vial', 'rutas en el mapa', 'osmnx local'],
  },
  {
    id: 'listo',
    order: 9,
    label: 'Listo',
    panelTitle: 'Simulación completada',
    whatItDoes:
      'Muestra el ahorro estimado (distancia, tiempo, combustible) y las rutas en el mapa.',
    whyItMatters:
      'Cierra el ciclo: puedes medir el impacto del algoritmo y decidir el siguiente paso operativo.',
    progressWeight: 2,
    simulatedDurationMs: 400,
    mapAnimation: 'route_complete',
    logMatchers: ['completada', 'completado', 'listo'],
  },
] as const;

export const EXECUTION_PHASE_COUNT = EXECUTION_PHASES.length;

const phaseById = new Map(EXECUTION_PHASES.map((phase) => [phase.id, phase]));

export function getExecutionPhase(id: ExecutionPhaseId): ExecutionPhaseDefinition {
  return phaseById.get(id)!;
}

const EXECUTION_PHASE_IDS = new Set(EXECUTION_PHASES.map((phase) => phase.id));

export function isExecutionPhaseId(value: string | null | undefined): value is ExecutionPhaseId {
  if (!value) return false;
  return EXECUTION_PHASE_IDS.has(value as ExecutionPhaseId);
}

export function tryGetExecutionPhase(id: string | null | undefined): ExecutionPhaseDefinition | null {
  if (!isExecutionPhaseId(id)) return null;
  return getExecutionPhase(id);
}

export function getExecutionPhaseByOrder(order: number): ExecutionPhaseDefinition | undefined {
  return EXECUTION_PHASES.find((phase) => phase.order === order);
}

/** Progreso acumulado 0–100 al completar la fase indicada (inclusive). */
export function getPhaseProgressPercent(phaseId: ExecutionPhaseId): number {
  let total = 0;
  for (const phase of EXECUTION_PHASES) {
    total += phase.progressWeight;
    if (phase.id === phaseId) return total;
  }
  return 100;
}

/** Progreso al inicio de una fase (antes de completarla). */
export function getPhaseStartProgressPercent(phaseId: ExecutionPhaseId): number {
  let total = 0;
  for (const phase of EXECUTION_PHASES) {
    if (phase.id === phaseId) return total;
    total += phase.progressWeight;
  }
  return 0;
}

export function getNextPhaseId(current: ExecutionPhaseId): ExecutionPhaseId | null {
  const index = EXECUTION_PHASES.findIndex((phase) => phase.id === current);
  if (index < 0 || index >= EXECUTION_PHASES.length - 1) return null;
  return EXECUTION_PHASES[index + 1]!.id;
}

export function resolvePhaseFromLogMessage(message: string): ExecutionPhaseId | null {
  const normalized = message.toLowerCase();
  for (const phase of [...EXECUTION_PHASES].reverse()) {
    if (phase.logMatchers.some((matcher) => normalized.includes(matcher.toLowerCase()))) {
      return phase.id;
    }
  }
  return null;
}

export function formatExecutionPhaseTitle(phaseId: ExecutionPhaseId): string {
  const phase = getExecutionPhase(phaseId);
  return `Fase ${phase.order} de ${EXECUTION_PHASE_COUNT}: ${phase.panelTitle}`;
}

/** Subtítulo en WizardStepNav durante la ejecución (paso 2). */
export function formatWizardExecutionSubstatus(
  phaseIndex: number,
  totalPhases: number,
  phaseLabel: string,
): string {
  return `Ejecutando — fase ${phaseIndex} de ${totalPhases}: ${phaseLabel}`;
}

export const EXECUTION_CANCEL_MESSAGES = {
  inProgress: 'Cancelando ejecución…',
  done: 'Ejecución cancelada. Ajusta el escenario y pulsa «Ejecutar simulación» cuando quieras reintentar.',
  confirmTitle: '¿Cancelar la ejecución?',
  error: 'No se pudo completar la simulación. Revisa los recursos del sistema e inténtalo de nuevo.',
} as const;

/** Suma de duraciones simuladas (ms) — útil para timers en Fase 7.1 */
export function totalSimulatedDurationMs(): number {
  return EXECUTION_PHASES.reduce((sum, phase) => sum + phase.simulatedDurationMs, 0);
}
