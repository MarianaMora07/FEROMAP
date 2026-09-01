/**
 * Puntos sintéticos adicionales para stress test VRP+ACO (CE-COMBINATORIO).
 * Se fusionan en export-seeds → collection_points.json
 */

export interface StressCollectionPointSeed {
  code: string;
  sectorName: string;
  latitude: number;
  longitude: number;
  maxCapacityKg: number;
  fillLevelPct: number;
  priority: string;
  lastCollection: string;
}

const STRESS_SECTORS = [
  'Unare I',
  'Unare II',
  'Uchire',
  'Rio Caura',
  'Ventuari',
  'Curagua B',
  'El caimito 1-2-3-4',
  'Villa Ikabaru',
  'Terrazas del caroni A-B-C',
  'Las Garzas',
  'Las Peonias',
  'Paratepuy',
  'Villa Caroni',
  'Rio Aro',
  'Los Bucares',
] as const;

const PRIORITIES = ['baja', 'media', 'alta', 'critica'] as const;

/** Genera CNT-021 … CNT-080 (60 puntos) en malla densa sobre Unare. */
export function generateStressCollectionPoints(
  startIndex = 21,
  count = 60,
): StressCollectionPointSeed[] {
  const baseLat = 8.272;
  const baseLon = -62.762;
  const points: StressCollectionPointSeed[] = [];

  for (let i = 0; i < count; i += 1) {
    const id = startIndex + i;
    const row = Math.floor(i / 10);
    const col = i % 10;
    const zigzag = row % 2 === 0 ? col : 9 - col;
    points.push({
      code: `CNT-${String(id).padStart(3, '0')}`,
      sectorName: STRESS_SECTORS[i % STRESS_SECTORS.length]!,
      latitude: Number((baseLat - row * 0.0016 + (col % 3) * 0.00025).toFixed(6)),
      longitude: Number((baseLon - zigzag * 0.0014 + (row % 3) * 0.0002).toFixed(6)),
      maxCapacityKg: id % 7 === 0 ? 800 : id % 5 === 0 ? 1000 : 1200,
      fillLevelPct: 28 + ((id * 13) % 65),
      priority: PRIORITIES[id % PRIORITIES.length]!,
      lastCollection: `2026-06-${String(1 + (id % 9)).padStart(2, '0')}T0${6 + (id % 4)}:30:00Z`,
    });
  }

  return points;
}
