export const collectionPointsPageMeta = {
  title: 'Gestión de Puntos de Recolección',
  subtitle: 'Administra y monitorea los contenedores y puntos de recolección.',
};

export type FillStatus = 'critico' | 'lleno' | 'normal' | 'parcial' | 'fuera-de-servicio';

export interface CollectionPoint {
  id: string;
  label: string;
  address: string;
  sector: string;
  fillLevel: number;
  status: FillStatus;
  active: boolean;
  containerType: string;
  capacityL: number;
  lastCollection: string;
  frequency: string;
  lng: number;
  lat: number;
  usedInLastOptimization?: boolean;
  priorityBoost?: boolean;
}

export function fillStatusFromLevel(level: number, outOfService = false): FillStatus {
  if (outOfService) return 'fuera-de-servicio';
  if (level > 90) return 'critico';
  if (level >= 70) return 'lleno';
  if (level >= 30) return 'normal';
  return 'parcial';
}

export function fillStatusColor(status: FillStatus): string {
  switch (status) {
    case 'critico':
      return '#ef4444';
    case 'lleno':
      return '#f59e0b';
    case 'normal':
      return '#34D634';
    case 'parcial':
      return '#94a3b8';
    default:
      return '#334155';
  }
}

export function fillStatusBarColor(status: FillStatus): 'green' | 'amber' | 'red' | 'blue' {
  switch (status) {
    case 'critico':
      return 'red';
    case 'lleno':
      return 'amber';
    case 'parcial':
      return 'blue';
    default:
      return 'green';
  }
}

export const collectionPointsKpis = [
  { id: 'total', title: 'Total de puntos', value: 248, unit: 'Unidades', iconTone: 'green' as const },
  { id: 'normal', title: 'Puntos normales', value: 186, unit: '75%', iconTone: 'green' as const },
  { id: 'critico', title: 'Puntos críticos', value: 18, unit: '7%', iconTone: 'amber' as const },
  { id: 'lleno', title: 'Puntos llenos', value: 36, unit: '15%', iconTone: 'red' as const },
  { id: 'parcial', title: 'Parcialmente llenos', value: 8, unit: '3%', iconTone: 'slate' as const },
];

export const collectionPointStatusOptions = [
  { value: '', label: 'Estado: Todos' },
  { value: 'critico', label: 'Crítico' },
  { value: 'lleno', label: 'Lleno' },
  { value: 'normal', label: 'Normal' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'fuera-de-servicio', label: 'Fuera de servicio' },
];

export const collectionPointSectorOptions = [
  { value: '', label: 'Sector: Todos' },
  { value: 'Unare I', label: 'Unare I' },
  { value: 'Unare II', label: 'Unare II' },
  { value: 'Unare III', label: 'Unare III' },
  { value: 'Río Caura', label: 'Río Caura' },
  { value: 'Ventuari', label: 'Ventuari' },
  { value: 'Curagua', label: 'Curagua' },
];

export const mapFillLegend = [
  { status: 'critico' as const, label: 'Crítico (>90%)' },
  { status: 'lleno' as const, label: 'Lleno (70%–90%)' },
  { status: 'normal' as const, label: 'Normal (30%–70%)' },
  { status: 'parcial' as const, label: 'Parcial (<30%)' },
  { status: 'fuera-de-servicio' as const, label: 'Fuera de servicio' },
];

export const collectionPointsList: CollectionPoint[] = [
  {
    id: '045',
    label: 'Punto #045',
    address: 'Av. Atlántico con Calle Guayana',
    sector: 'Unare I',
    fillLevel: 98,
    status: 'critico',
    active: true,
    containerType: 'Contenedor 1.100 L',
    capacityL: 1100,
    lastCollection: '23/06/2026 06:40 AM',
    frequency: 'Diaria',
    lng: -62.7225,
    lat: 8.2968,
  },
  {
    id: '112',
    label: 'Punto #112',
    address: 'Calle Principal Sector Centro',
    sector: 'Unare II',
    fillLevel: 72,
    status: 'lleno',
    active: true,
    containerType: 'Contenedor 1.100 L',
    capacityL: 1100,
    lastCollection: '24/06/2026 07:10 AM',
    frequency: 'Diaria',
    lng: -62.712,
    lat: 8.2975,
  },
  {
    id: '078',
    label: 'Punto #078',
    address: 'Av. Guayana con Calle 5',
    sector: 'Unare III',
    fillLevel: 45,
    status: 'normal',
    active: true,
    containerType: 'Contenedor 800 L',
    capacityL: 800,
    lastCollection: '24/06/2026 08:00 AM',
    frequency: 'Diaria',
    lng: -62.718,
    lat: 8.287,
  },
  {
    id: '203',
    label: 'Punto #203',
    address: 'Urbanización Río Caura Norte',
    sector: 'Río Caura',
    fillLevel: 88,
    status: 'lleno',
    active: true,
    containerType: 'Contenedor 1.100 L',
    capacityL: 1100,
    lastCollection: '23/06/2026 05:50 AM',
    frequency: 'Diaria',
    lng: -62.732,
    lat: 8.294,
  },
  {
    id: '156',
    label: 'Punto #156',
    address: 'Calle Los Proceres',
    sector: 'Ventuari',
    fillLevel: 22,
    status: 'parcial',
    active: true,
    containerType: 'Contenedor 1.000 L',
    capacityL: 1000,
    lastCollection: '25/06/2026 06:15 AM',
    frequency: 'Interdiaria',
    lng: -62.702,
    lat: 8.295,
  },
  {
    id: '089',
    label: 'Punto #089',
    address: 'Plaza Bolívar Unare',
    sector: 'Unare I',
    fillLevel: 55,
    status: 'normal',
    active: true,
    containerType: 'Contenedor 1.100 L',
    capacityL: 1100,
    lastCollection: '24/06/2026 06:30 AM',
    frequency: 'Diaria',
    lng: -62.725,
    lat: 8.299,
  },
  {
    id: '167',
    label: 'Punto #167',
    address: 'Av. Atlántico km 2',
    sector: 'Curagua',
    fillLevel: 93,
    status: 'critico',
    active: true,
    containerType: 'Contenedor 800 L',
    capacityL: 800,
    lastCollection: '22/06/2026 09:20 AM',
    frequency: 'Diaria',
    lng: -62.731,
    lat: 8.282,
  },
  {
    id: '034',
    label: 'Punto #034',
    address: 'Calle Comercio con Av. Principal',
    sector: 'Unare II',
    fillLevel: 38,
    status: 'normal',
    active: true,
    containerType: 'Contenedor 1.100 L',
    capacityL: 1100,
    lastCollection: '25/06/2026 07:00 AM',
    frequency: 'Diaria',
    lng: -62.71,
    lat: 8.293,
  },
  {
    id: '221',
    label: 'Punto #221',
    address: 'Sector Villa Alta',
    sector: 'Ventuari',
    fillLevel: 0,
    status: 'fuera-de-servicio',
    active: false,
    containerType: 'Contenedor 1.000 L',
    capacityL: 1000,
    lastCollection: '10/06/2026 11:00 AM',
    frequency: 'Suspendida',
    lng: -62.705,
    lat: 8.289,
  },
  {
    id: '198',
    label: 'Punto #198',
    address: 'Calle Caura Sur',
    sector: 'Río Caura',
    fillLevel: 81,
    status: 'lleno',
    active: true,
    containerType: 'Contenedor 1.100 L',
    capacityL: 1100,
    lastCollection: '23/06/2026 06:00 AM',
    frequency: 'Diaria',
    lng: -62.729,
    lat: 8.29,
  },
];

export const fillHistory7d = {
  labels: ['19 jun', '20 jun', '21 jun', '22 jun', '23 jun', '24 jun', '25 jun'],
  values: [42, 55, 63, 71, 82, 90, 98],
};

export const fillDistribution = {
  total: 248,
  items: [
    { status: 'critico' as const, label: 'Crítico', count: 18, pct: 7, color: '#ef4444' },
    { status: 'lleno' as const, label: 'Lleno', count: 36, pct: 15, color: '#f59e0b' },
    { status: 'normal' as const, label: 'Normal', count: 186, pct: 75, color: '#34D634' },
    { status: 'parcial' as const, label: 'Parcial', count: 8, pct: 3, color: '#94a3b8' },
  ],
};
