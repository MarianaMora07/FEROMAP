export type AlertPriority = 'critica' | 'advertencia' | 'informativa';
export type AlertStatus = 'nueva' | 'en-progreso' | 'informativa' | 'resuelta';
export type AlertCategory = 'contenedores' | 'trafico' | 'vehiculos' | 'mantenimiento' | 'sistema';

export interface SystemAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  detail: string;
  source: string;
  location: string;
  datetime: string;
  status: AlertStatus;
  category: AlertCategory;
  lng: number;
  lat: number;
  lifecycleStatus?: 'open' | 'acknowledged' | 'resolved';
}

export const priorityColor: Record<AlertPriority, string> = {
  critica: '#ef4444',
  advertencia: '#f59e0b',
  informativa: '#1143F3',
};
