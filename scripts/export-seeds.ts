/**
 * Exporta los mocks de FEROMAP a JSON en data/seeds/ (fuente para seed_from_mocks.py).
 * Ejecutar: npm run export-seeds
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { alertsList } from '../src/data/mock/alerts.ts';
import { containersData } from '../src/data/mock/containers.ts';
import {
  kpiByScenario,
  optimizationLogMessages,
  scenarios,
} from '../src/data/mock/kpis.ts';
import { liveFleet, monitoringKpis } from '../src/data/mock/monitoring.ts';
import { routesMock } from '../src/data/mock/routes.ts';
import { sectorsData } from '../src/data/mock/sectors.ts';
import { vehiclesList } from '../src/data/mock/vehicles.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data', 'seeds');

mkdirSync(outDir, { recursive: true });

const parish = { name: 'Unare', city: 'Ciudad Guayana' };

const sectors = sectorsData.features.map((feature) => ({
  name: feature.properties.name,
  parishName: parish.name,
  population: feature.properties.population,
  avgWasteKg: feature.properties.avgWasteKg,
  geometry: feature.geometry,
}));

const collectionPoints = containersData.features.map((feature) => ({
  code: feature.properties.id,
  sectorName: feature.properties.sector,
  latitude: feature.geometry.coordinates[1],
  longitude: feature.geometry.coordinates[0],
  maxCapacityKg: feature.properties.capacityKg,
  fillLevelPct: feature.properties.fillLevel,
  priority: feature.properties.priority,
  lastCollection: feature.properties.lastCollection,
}));

const vehicleStatusMap: Record<string, string> = {
  'en-ruta': 'in_route',
  disponible: 'available',
  mantenimiento: 'maintenance',
  'fuera-de-servicio': 'inactive',
};

const vehicles = vehiclesList.map((vehicle) => ({
  code: vehicle.id,
  licensePlate: vehicle.plate,
  maxCapacityKg: Math.round(vehicle.capacityM3 * 1000),
  fuelConsumptionRate: 0.35,
  status: vehicleStatusMap[vehicle.status] ?? 'available',
  vehicleType: vehicle.type,
  driverName: vehicle.driver === '—' ? null : vehicle.driver,
  driverPhone: vehicle.driverPhone ?? null,
}));

const driverNames = [
  ...new Set(
    vehiclesList
      .map((v) => v.driver)
      .filter((name): name is string => Boolean(name) && name !== '—'),
  ),
];

const drivers = driverNames.map((fullName, index) => {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.slice(1).join(' ') || firstName;
  const slug = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
  return {
    document: `V-${String(index + 1).padStart(7, '0')}`,
    firstName,
    lastName,
    phone: vehiclesList.find((v) => v.driver === fullName)?.driverPhone ?? null,
    slug,
  };
});

const routes = routesMock.features.map((feature) => ({
  id: feature.properties.id,
  kind: feature.properties.type,
  label: feature.properties.label,
  distanceKm: feature.properties.distanceKm,
  durationMin: feature.properties.durationMin,
  coordinates: feature.geometry.coordinates,
}));

const simulations = scenarios.map((scenario) => {
  const kpi = kpiByScenario[scenario.id];
  const historical = kpi?.distanceKm.current ?? 0;
  const optimized = kpi?.distanceKm.optimized ?? 0;
  const saving =
    historical > 0 ? Math.round(((historical - optimized) / historical) * 10000) / 100 : 0;
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.label,
    parameters: {
      trafficMultiplier: scenario.trafficMultiplier,
      fillLevelBoost: scenario.fillLevelBoost,
      description: scenario.description,
    },
    kpiTotalDistanceHistorical: historical,
    kpiTotalDistanceOptimized: optimized,
    kpiSavingPercentage: saving,
  };
});

const write = (name: string, data: unknown) => {
  writeFileSync(join(outDir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

write('parish.json', parish);
write('sectors.json', sectors);
write('collection_points.json', collectionPoints);
write('vehicles.json', vehicles);
write('drivers.json', drivers);
write('routes.json', routes);
write('simulations.json', simulations);
write('scenarios.json', scenarios);
write('kpis.json', kpiByScenario);
write('optimization_logs.json', optimizationLogMessages);
write('alerts.json', alertsList);
write('monitoring.json', { kpis: monitoringKpis, liveFleet });

console.log(`✅ Seeds exportados en ${outDir}`);
