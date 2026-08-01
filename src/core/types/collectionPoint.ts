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
