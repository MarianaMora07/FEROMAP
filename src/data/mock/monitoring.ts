export const monitoringPageMeta = {
  title: 'Monitoreo en Tiempo Real',
  subtitle: 'Visualiza la ubicación y estado de tu flota en tiempo real.',
};

export type FleetLiveStatus = 'en-ruta' | 'mantenimiento' | 'detenido' | 'disponible';

export const monitoringKpis = [
  {
    id: 'vehicles',
    title: 'Vehículos en ruta',
    value: '12 / 18',
    progress: 66,
    iconTone: 'blue' as const,
    icon: 'truck' as const,
  },
  {
    id: 'collections',
    title: 'Recolecciones hoy',
    value: '186 / 248',
    progress: 75,
    iconTone: 'green' as const,
    icon: 'trash' as const,
  },
  {
    id: 'tons',
    title: 'Toneladas recolectadas',
    value: '28.6 / 40 t',
    progress: 71,
    iconTone: 'green' as const,
    icon: 'scale' as const,
  },
  {
    id: 'incidents',
    title: 'Incidencias activas',
    value: '3',
    linkLabel: 'ver detalles',
    iconTone: 'red' as const,
    icon: 'shield' as const,
  },
  {
    id: 'drivers',
    title: 'Conductores conectados',
    value: '12 / 14',
    progress: 86,
    iconTone: 'green' as const,
    icon: 'user' as const,
  },
];

const truckImg =
  'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=160&h=120&q=80';
const truckImg2 =
  'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=160&h=120&q=80';
const truckImg3 =
  'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=160&h=120&q=80';

export interface LiveVehicle {
  id: string;
  status: FleetLiveStatus;
  driver: string;
  route: string;
  progress: number;
  speedKmh: number | null;
  nextPoint: string;
  color: string;
  image: string;
  lng: number;
  lat: number;
  routeId?: number | null;
}

export const liveFleet: LiveVehicle[] = [
  {
    id: 'TR-08',
    status: 'en-ruta',
    driver: 'Juan Pérez',
    route: 'Ruta Norte 01',
    progress: 68,
    speedKmh: 45,
    nextPoint: 'Av. Principal con Calle Sucre',
    color: '#34D634',
    image: truckImg,
    lng: -62.72,
    lat: 8.297,
  },
  {
    id: 'TR-04',
    status: 'en-ruta',
    driver: 'Luis Méndez',
    route: 'Ruta Centro 02',
    progress: 82,
    speedKmh: 38,
    nextPoint: 'Calle Comercio',
    color: '#1143F3',
    image: truckImg2,
    lng: -62.712,
    lat: 8.293,
  },
  {
    id: 'TR-11',
    status: 'mantenimiento',
    driver: 'Ana Pérez',
    route: '—',
    progress: 0,
    speedKmh: null,
    nextPoint: 'Taller Central',
    color: '#f59e0b',
    image: truckImg3,
    lng: -62.728,
    lat: 8.29,
  },
  {
    id: 'TR-02',
    status: 'en-ruta',
    driver: 'María Gómez',
    route: 'Ruta Sur 01',
    progress: 54,
    speedKmh: 32,
    nextPoint: 'Plaza Bolívar Sur',
    color: '#7c3aed',
    image: truckImg,
    lng: -62.716,
    lat: 8.286,
  },
  {
    id: 'TR-06',
    status: 'detenido',
    driver: 'Sofía Díaz',
    route: 'Ruta Oeste 03',
    progress: 40,
    speedKmh: 0,
    nextPoint: 'Av. Atlántico km 1',
    color: '#ef4444',
    image: truckImg2,
    lng: -62.725,
    lat: 8.295,
  },
];

export const monitoringMapRoutes = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: {
        id: 'route-1',
        routeId: 1,
        label: 'Ruta TR-08',
        color: '#34D634',
        vehicleId: 'TR-08',
        status: 'in_progress',
        routeKind: 'optimized',
        waypointsTotal: 18,
        waypointsDone: 12,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.715, 8.295],
          [-62.718, 8.296],
          [-62.721, 8.297],
          [-62.724, 8.298],
          [-62.72, 8.297],
          [-62.714, 8.294],
          [-62.708, 8.29],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: {
        id: 'route-2',
        routeId: 2,
        label: 'Ruta TR-04',
        color: '#1143F3',
        vehicleId: 'TR-04',
        status: 'in_progress',
        routeKind: 'optimized',
        waypointsTotal: 16,
        waypointsDone: 9,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.715, 8.295],
          [-62.717, 8.297],
          [-62.718, 8.298],
          [-62.712, 8.293],
          [-62.706, 8.289],
        ],
      },
    },
    {
      type: 'Feature' as const,
      properties: {
        id: 'route-3',
        routeId: 3,
        label: 'Ruta TR-02',
        color: '#7c3aed',
        vehicleId: 'TR-02',
        status: 'pending',
        routeKind: 'optimized',
        waypointsTotal: 15,
        waypointsDone: 0,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-62.715, 8.295],
          [-62.719, 8.291],
          [-62.722, 8.288],
          [-62.718, 8.286],
          [-62.716, 8.286],
          [-62.71, 8.282],
        ],
      },
    },
  ],
};

export const monitoringBins = [
  { id: 'b1', lng: -62.724, lat: 8.299, status: 'normal' as const },
  { id: 'b2', lng: -62.715, lat: 8.295, status: 'full' as const },
  { id: 'b3', lng: -62.708, lat: 8.291, status: 'critical' as const },
  { id: 'b4', lng: -62.719, lat: 8.285, status: 'normal' as const },
  { id: 'b5', lng: -62.726, lat: 8.292, status: 'full' as const },
];

export const liveActivities = [
  {
    id: 'a1',
    time: '10:24 AM',
    text: 'TR-08 completó recolección en Av. Principal',
    tone: 'success' as const,
  },
  {
    id: 'a2',
    time: '10:18 AM',
    text: 'TR-04 inició Ruta Centro 02',
    tone: 'info' as const,
  },
  {
    id: 'a3',
    time: '10:12 AM',
    text: 'TR-06 detenido por tráfico en Av. Atlántico',
    tone: 'warning' as const,
  },
  {
    id: 'a4',
    time: '10:05 AM',
    text: 'Contenedor #045 alcanzó nivel crítico',
    tone: 'danger' as const,
  },
  {
    id: 'a5',
    time: '09:58 AM',
    text: 'TR-02 reportó siguiente punto en Plaza Sur',
    tone: 'default' as const,
  },
];

export const routeProgress = [
  { id: 'norte', label: 'Norte 01', pct: 68, done: 12, total: 18, color: 'green' as const },
  { id: 'centro', label: 'Centro 02', pct: 82, done: 14, total: 17, color: 'blue' as const },
  { id: 'sur', label: 'Sur 01', pct: 54, done: 9, total: 16, color: 'purple' as const },
  { id: 'oeste', label: 'Oeste 03', pct: 40, done: 6, total: 15, color: 'amber' as const },
];

export const monitoringAlerts = [
  {
    id: 'al1',
    title: 'Tráfico alto',
    detail: 'Congestión en Av. Guayana · TR-06',
    time: 'hace 4 min',
    tone: 'danger' as const,
  },
  {
    id: 'al2',
    title: 'Contenedor lleno',
    detail: 'Punto #112 · Sector Unare II',
    time: 'hace 12 min',
    tone: 'warning' as const,
  },
  {
    id: 'al3',
    title: 'Retraso en recolección',
    detail: 'Ruta Sur 01 · +18 min',
    time: 'hace 21 min',
    tone: 'warning' as const,
  },
];

export const currentConditions = {
  weather: { label: 'Lluvia ligera', tempC: 18 },
  traffic: 'Moderado',
  affectedRoads: 2,
};

export const vehicleFilterOptions = [
  { value: '', label: 'Todos los vehículos' },
  { value: 'en-ruta', label: 'En ruta' },
  { value: 'detenido', label: 'Detenido' },
  { value: 'mantenimiento', label: 'En mantenimiento' },
  { value: 'disponible', label: 'Disponible' },
];
