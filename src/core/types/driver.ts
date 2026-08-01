export interface Driver {
  id: number;
  document: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  active: boolean;
  assignedVehicles: number;
}

export interface DriverCreate {
  email: string;
  password: string;
  document: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface DriverUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  document?: string;
  active?: boolean;
}

export function driverDisplayName(driver: Pick<Driver, 'firstName' | 'lastName'>): string {
  return `${driver.firstName} ${driver.lastName}`.trim();
}
