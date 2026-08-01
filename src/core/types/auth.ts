export type UserRole = 'administrador' | 'planificador' | 'conductor' | 'residente';

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  sectorId?: number | null;
  sectorName?: string | null;
  driverId?: number | null;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  administrador: 'Administrador',
  planificador: 'Planificador',
  conductor: 'Conductor',
  residente: 'Residente',
};

export const DEMO_USERS: Array<{ email: string; role: UserRole; label: string }> = [
  { email: 'admin@fero.com', role: 'administrador', label: 'Administrador' },
  { email: 'plan@fero.com', role: 'planificador', label: 'Planificador' },
  { email: 'conductor@fero.com', role: 'conductor', label: 'Conductor' },
  { email: 'residente@fero.com', role: 'residente', label: 'Residente' },
];

export const DEMO_PASSWORD = '123456789';
