export const mapGisMetrics = [
  { id: 'total', label: 'Contenedores totales', value: 248, tone: 'green' as const, icon: 'trash' as const },
  { id: 'critical', label: 'Contenedores críticos', value: 18, tone: 'red' as const, icon: 'trash' as const },
  { id: 'full', label: 'Contenedores llenos', value: 36, tone: 'amber' as const, icon: 'trash' as const },
  { id: 'vehicles', label: 'Vehículos activos', value: 14, tone: 'blue' as const, icon: 'truck' as const },
  { id: 'routes', label: 'Rutas en ejecución', value: 4, tone: 'green' as const, icon: 'route' as const },
];

export const mapBaseStyles = [
  {
    id: 'claro',
    label: 'Claro',
    preview: 'https://basemaps.cartocdn.com/rastertiles/voyager/12/1334/1953.png',
  },
  {
    id: 'oscuro',
    label: 'Oscuro',
    preview: 'https://basemaps.cartocdn.com/dark_all/12/1334/1953.png',
  },
  {
    id: 'satelital',
    label: 'Satelital',
    preview:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1953/1334',
  },
  {
    id: 'terreno',
    label: 'Terreno',
    preview: 'https://tile.opentopomap.org/12/1334/1953.png',
  },
] as const;

export type MapBaseStyleId = (typeof mapBaseStyles)[number]['id'];

export type MapLayerChild = {
  id: string;
  label: string;
  checked: boolean;
  kind: 'line' | 'trash' | 'truck';
  class: string;
  /** Filter key for map sync */
  filter?: string;
};

export type MapLayerItem = {
  id: string;
  label: string;
  checked: boolean;
  children?: MapLayerChild[];
};

/** Capas del panel (estructura del mockup). */
export const mapLayers: MapLayerItem[] = [
  { id: 'streets', label: 'Calles', checked: true },
  { id: 'neighborhoods', label: 'Barrios', checked: true },
  { id: 'sectors', label: 'Sectores', checked: true },
  {
    id: 'routes',
    label: 'Rutas en ejecución',
    checked: true,
    children: [
      { id: 'route-01', label: 'Ruta 01', checked: true, kind: 'line', class: 'bg-fero-green-dark', filter: 'current' },
      { id: 'route-02', label: 'Ruta 02', checked: true, kind: 'line', class: 'bg-fero-blue', filter: 'optimized' },
      { id: 'route-03', label: 'Ruta 03', checked: true, kind: 'line', class: 'bg-violet-500', filter: 'ruta-03' },
      { id: 'route-04', label: 'Ruta 04', checked: true, kind: 'line', class: 'bg-orange-500', filter: 'ruta-04' },
    ],
  },
  {
    id: 'containers',
    label: 'Contenedores',
    checked: true,
    children: [
      { id: 'bin-critical', label: 'Crítico', checked: true, kind: 'trash', class: 'text-red-500', filter: 'critical' },
      { id: 'bin-full', label: 'Lleno', checked: true, kind: 'trash', class: 'text-amber-500', filter: 'full' },
      { id: 'bin-normal', label: 'Normal', checked: true, kind: 'trash', class: 'text-fero-green-dark', filter: 'normal' },
      { id: 'bin-partial', label: 'Parcialmente lleno', checked: true, kind: 'trash', class: 'text-slate-400', filter: 'partial' },
    ],
  },
  {
    id: 'vehicles',
    label: 'Vehículos',
    checked: true,
    children: [
      { id: 'veh-en_ruta', label: 'En ruta', checked: true, kind: 'truck', class: 'text-fero-green-dark', filter: 'en_ruta' },
      { id: 'veh-detenido', label: 'Detenido', checked: true, kind: 'truck', class: 'text-amber-500', filter: 'detenido' },
      { id: 'veh-mantenimiento', label: 'En mantenimiento', checked: true, kind: 'truck', class: 'text-slate-400', filter: 'mantenimiento' },
      { id: 'veh-disponible', label: 'Disponible', checked: true, kind: 'truck', class: 'text-fero-blue', filter: 'disponible' },
    ],
  },
  { id: 'traffic', label: 'Tráfico en tiempo real', checked: false },
  { id: 'incidents', label: 'Incidencias viales', checked: false },
  { id: 'satellite', label: 'Imágenes satelitales', checked: false },
];

export function initialLayerState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const layer of mapLayers) {
    state[layer.id] = layer.checked;
    for (const child of layer.children ?? []) {
      state[child.id] = child.checked;
    }
  }
  return state;
}

export const mapLegend = {
  containers: [
    { label: 'Crítico', class: 'text-red-500' },
    { label: 'Lleno', class: 'text-amber-500' },
    { label: 'Normal', class: 'text-fero-green-dark' },
    { label: 'Parcialmente lleno', class: 'text-slate-400' },
  ],
  vehicles: [
    { label: 'En ruta', class: 'text-fero-green-dark' },
    { label: 'Disponible', class: 'text-fero-blue' },
    { label: 'Detenido', class: 'text-amber-500' },
    { label: 'Fuera de servicio', class: 'text-slate-400' },
  ],
  routes: [
    { label: 'Ruta 01', class: 'bg-fero-green-dark' },
    { label: 'Ruta 02', class: 'bg-fero-blue' },
    { label: 'Ruta 03', class: 'bg-violet-500' },
    { label: 'Ruta 04', class: 'bg-orange-500' },
  ],
  others: [
    { id: 'gas', label: 'Estaciones de servicio', icon: 'fuel' as const },
    { id: 'landfill', label: 'Vertedero', icon: 'landfill' as const },
  ],
};

export const mapVehicles = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { id: 'TR-08', status: 'en_ruta' as const, color: '#34D634' },
      geometry: { type: 'Point' as const, coordinates: [-62.72, 8.296] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'TR-04', status: 'disponible' as const, color: '#1143F3' },
      geometry: { type: 'Point' as const, coordinates: [-62.71, 8.29] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'TR-11', status: 'detenido' as const, color: '#f59e0b' },
      geometry: { type: 'Point' as const, coordinates: [-62.705, 8.285] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'TR-06', status: 'en_ruta' as const, color: '#34D634' },
      geometry: { type: 'Point' as const, coordinates: [-62.728, 8.28] as [number, number] },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'TR-02', status: 'mantenimiento' as const, color: '#94a3b8' },
      geometry: { type: 'Point' as const, coordinates: [-62.718, 8.3] as [number, number] },
    },
  ],
};

/** Rutas adicionales de demo (colores distintos). */
export const mapExtraRoutes = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { id: 'ruta-03', color: '#8b5cf6', label: 'Ruta 03' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.715, 8.295],
          [-62.722, 8.288],
          [-62.73, 8.281],
          [-62.718, 8.278],
          [-62.71, 8.284],
        ] as [number, number][],
      },
    },
    {
      type: 'Feature' as const,
      properties: { id: 'ruta-04', color: '#f97316', label: 'Ruta 04' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.715, 8.295],
          [-62.708, 8.292],
          [-62.701, 8.292],
          [-62.7, 8.282],
          [-62.706, 8.275],
        ] as [number, number][],
      },
    },
  ],
};
