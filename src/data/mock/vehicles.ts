export const vehiclesPageMeta = {
  title: 'Gestión de Vehículos',
  subtitle: 'Administra la flota de recolección de residuos.',
};

export type VehicleStatus = 'en-ruta' | 'disponible' | 'mantenimiento' | 'fuera-de-servicio';
export type VehicleType = 'Compactador' | 'Volteo' | 'Recolector';

export interface Vehicle {
  id: string;
  type: VehicleType;
  plate: string;
  status: VehicleStatus;
  driver: string;
  driverPhone?: string;
  fuelPct: number | null;
  fuelLiters?: number;
  capacityPct: number | null;
  capacityM3: number;
  maxCapacityKg?: number;
  model: string;
  year: number;
  mileageKm: number;
  base: string;
  currentRoute?: string;
  updatedAt: string;
  image: string;
  usedInLastOptimization?: boolean;
}

const truckImages = {
  compactadorA:
    'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=480&h=320&q=80',
  compactadorB:
    'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=480&h=320&q=80',
  volteoA:
    'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=480&h=320&q=80',
  volteoB:
    'https://images.unsplash.com/photo-1501700493788-fa1a4fc9fe62?auto=format&fit=crop&w=480&h=320&q=80',
  recolectorA:
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=480&h=320&q=80',
  recolectorB:
    'https://images.unsplash.com/photo-1616432043562-3671ea2e5242?auto=format&fit=crop&w=480&h=320&q=80',
  mantenimiento:
    'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=480&h=320&q=80',
  fuera:
    'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=480&h=320&q=80',
} as const;

export const vehiclesKpis = [
  { id: 'total', title: 'Total de vehículos', value: 18, unit: 'Unidades', iconTone: 'blue' as const, icon: 'truck' as const },
  { id: 'active', title: 'Activos', value: 14, unit: '78%', iconTone: 'green' as const, icon: 'truck' as const },
  { id: 'maintenance', title: 'En mantenimiento', value: 2, unit: '11%', iconTone: 'amber' as const, icon: 'wrench' as const },
  { id: 'out', title: 'Fuera de servicio', value: 2, unit: '11%', iconTone: 'purple' as const, icon: 'flag' as const },
];

export const vehicleStatusOptions = [
  { value: '', label: 'Estado: Todos' },
  { value: 'en-ruta', label: 'En ruta' },
  { value: 'disponible', label: 'Disponible' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'fuera-de-servicio', label: 'Fuera de servicio' },
];

export const vehicleTypeOptions = [
  { value: '', label: 'Tipo: Todos' },
  { value: 'Compactador', label: 'Compactador' },
  { value: 'Volteo', label: 'Volteo' },
  { value: 'Recolector', label: 'Recolector' },
];

export const vehiclesList: Vehicle[] = [
  {
    id: 'TR-08',
    type: 'Compactador',
    plate: 'A12BC3D',
    status: 'en-ruta',
    driver: 'Juan Pérez',
    driverPhone: '+58 414-555-0192',
    fuelPct: 78,
    fuelLiters: 62,
    capacityPct: 65,
    capacityM3: 15,
    model: 'HINO 300 XZU720L',
    year: 2022,
    mileageKm: 45230,
    base: 'Base Unare',
    currentRoute: 'Ruta Norte 01',
    updatedAt: '25/06/2026 09:25 AM',
    image: truckImages.compactadorA,
  },
  {
    id: 'TR-03',
    type: 'Volteo',
    plate: 'B45DE6F',
    status: 'disponible',
    driver: 'Carlos Rivas',
    driverPhone: '+58 424-555-0144',
    fuelPct: 92,
    fuelLiters: 74,
    capacityPct: 12,
    capacityM3: 12,
    model: 'ISUZU FVR 34Q',
    year: 2021,
    mileageKm: 61200,
    base: 'Base Unare',
    updatedAt: '25/06/2026 08:10 AM',
    image: truckImages.volteoA,
  },
  {
    id: 'TR-11',
    type: 'Compactador',
    plate: 'C78GH9I',
    status: 'en-ruta',
    driver: 'Ana Pérez',
    driverPhone: '+58 412-555-0177',
    fuelPct: 54,
    fuelLiters: 43,
    capacityPct: 81,
    capacityM3: 15,
    model: 'HINO 500 FC9J',
    year: 2020,
    mileageKm: 88450,
    base: 'Base Castillito',
    currentRoute: 'Ruta Centro 02',
    updatedAt: '25/06/2026 09:12 AM',
    image: truckImages.compactadorB,
  },
  {
    id: 'TR-07',
    type: 'Recolector',
    plate: 'D01JK2L',
    status: 'mantenimiento',
    driver: '—',
    fuelPct: 35,
    fuelLiters: 28,
    capacityPct: 0,
    capacityM3: 8,
    model: 'MITSUBISHI Canter',
    year: 2019,
    mileageKm: 120340,
    base: 'Base Unare',
    updatedAt: '24/06/2026 04:40 PM',
    image: truckImages.mantenimiento,
  },
  {
    id: 'TR-04',
    type: 'Compactador',
    plate: 'E34MN5O',
    status: 'disponible',
    driver: 'Luis Méndez',
    driverPhone: '+58 416-555-0108',
    fuelPct: 88,
    fuelLiters: 70,
    capacityPct: 8,
    capacityM3: 15,
    model: 'HINO 300 XZU720L',
    year: 2023,
    mileageKm: 22100,
    base: 'Base Unare',
    updatedAt: '25/06/2026 07:55 AM',
    image: truckImages.compactadorA,
  },
  {
    id: 'TR-15',
    type: 'Volteo',
    plate: 'F67PQ8R',
    status: 'fuera-de-servicio',
    driver: '—',
    fuelPct: 10,
    fuelLiters: 8,
    capacityPct: 0,
    capacityM3: 12,
    model: 'FORD Cargo 1723',
    year: 2017,
    mileageKm: 198700,
    base: 'Taller Central',
    updatedAt: '20/06/2026 11:00 AM',
    image: truckImages.fuera,
  },
  {
    id: 'TR-02',
    type: 'Recolector',
    plate: 'G90ST1U',
    status: 'en-ruta',
    driver: 'María Gómez',
    driverPhone: '+58 426-555-0133',
    fuelPct: 61,
    fuelLiters: 49,
    capacityPct: 72,
    capacityM3: 8,
    model: 'HYUNDAI HD78',
    year: 2021,
    mileageKm: 54320,
    base: 'Base Villa Asia',
    currentRoute: 'Ruta Sur 01',
    updatedAt: '25/06/2026 09:18 AM',
    image: truckImages.recolectorA,
  },
  {
    id: 'TR-19',
    type: 'Compactador',
    plate: 'H23VW4X',
    status: 'mantenimiento',
    driver: 'Pedro Silva',
    driverPhone: '+58 414-555-0166',
    fuelPct: 45,
    fuelLiters: 36,
    capacityPct: 5,
    capacityM3: 18,
    model: 'MERCEDES Atego',
    year: 2018,
    mileageKm: 145800,
    base: 'Taller Central',
    updatedAt: '23/06/2026 02:15 PM',
    image: truckImages.mantenimiento,
  },
  {
    id: 'TR-06',
    type: 'Volteo',
    plate: 'I56YZ7A',
    status: 'disponible',
    driver: 'Sofía Díaz',
    driverPhone: '+58 424-555-0199',
    fuelPct: 70,
    fuelLiters: 56,
    capacityPct: 20,
    capacityM3: 10,
    model: 'ISUZU NPR 75',
    year: 2022,
    mileageKm: 38900,
    base: 'Base Castillito',
    updatedAt: '25/06/2026 08:40 AM',
    image: truckImages.volteoB,
  },
  {
    id: 'TR-12',
    type: 'Recolector',
    plate: 'J89BC0D',
    status: 'en-ruta',
    driver: 'Diego Torres',
    driverPhone: '+58 412-555-0121',
    fuelPct: 40,
    fuelLiters: 32,
    capacityPct: 90,
    capacityM3: 8,
    model: 'HYUNDAI HD65',
    year: 2020,
    mileageKm: 77210,
    base: 'Base Unare',
    currentRoute: 'Ruta Este 03',
    updatedAt: '25/06/2026 09:05 AM',
    image: truckImages.recolectorB,
  },
];

export const vehicleDetailTabs = [
  { id: 'info', label: 'Información' },
  { id: 'maintenance', label: 'Mantenimiento' },
  { id: 'history', label: 'Historial' },
  { id: 'docs', label: 'Documentos' },
] as const;

export type VehicleDetailTabId = (typeof vehicleDetailTabs)[number]['id'];
