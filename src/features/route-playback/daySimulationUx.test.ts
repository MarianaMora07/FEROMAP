import { describe, expect, it } from 'vitest';
import { mockDaySimulation } from '../../data/mock/daySimulation';
import {
  buildDayVehicleOptions,
  buildPausePoints,
  droppedSummary,
  elapsedOperationMinutes,
  filterPlaybackRoutesByLabels,
  inPlayVehicleLabels,
  mergeStepRoutes,
  nextPausePoint,
  planStabilityPct,
  playbackTotalMs,
  simulatedDayClockLabel,
  stepFraction,
  stepImpactLabel,
  stepStabilityPct,
} from './daySimulationUx';

describe('daySimulationUx', () => {
  it('comprime la jornada a ~5 minutos de animación', () => {
    expect(playbackTotalMs(5)).toBe(300_000);
    expect(playbackTotalMs(0)).toBe(1);
  });

  it('calcula las fracciones de pausa desde atMinutes', () => {
    const simulation = mockDaySimulation(2);
    const points = buildPausePoints(simulation);

    expect(points.map((point) => point.stepId)).toEqual(['step-1-breakdown', 'step-2-critical']);
    expect(points[0]!.fraction).toBeCloseTo(168 / 480, 5);
    expect(points[1]!.fraction).toBeCloseTo(336 / 480, 5);
    // atMs sobre el eje comprimido (5 min).
    expect(points[0]!.atMs).toBe(Math.round((168 / 480) * 300_000));
    expect(points[0]!.atMs).toBeLessThan(points[1]!.atMs);
  });

  it('acota la fracción al rango 0..1', () => {
    expect(stepFraction(-10, 480)).toBe(0);
    expect(stepFraction(9999, 480)).toBe(1);
    expect(stepFraction(120, 0)).toBe(0);
  });

  it('devuelve el próximo evento alcanzado, saltando los ya resueltos', () => {
    const points = buildPausePoints(mockDaySimulation(2));

    expect(nextPausePoint(points, 0)).toBeNull();
    expect(nextPausePoint(points, 0.4)?.stepId).toBe('step-1-breakdown');
    expect(nextPausePoint(points, 0.4, ['step-1-breakdown'])).toBeNull();
    expect(nextPausePoint(points, 0.75, ['step-1-breakdown'])?.stepId).toBe('step-2-critical');
  });

  it('fusiona el tramo conservando las rutas no afectadas por la avería', () => {
    const simulation = mockDaySimulation(2);
    const base = simulation.baseRoutes;
    const step = simulation.steps[0]!;

    const merged = mergeStepRoutes(base, step);
    const labels = merged.map((route) => route.vehicleLabel);

    // Sale el vehículo averiado y entra el plan alternativo; el resto se conserva.
    expect(labels).not.toContain('TR-08');
    expect(labels).toContain('TR-04');
    expect(labels).toContain('TR-02');
    expect(labels).toContain('TR-11');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('retira al vehículo averiado aunque el paso no traiga plan alternativo', () => {
    const simulation = mockDaySimulation(2);
    const base = simulation.baseRoutes;
    const step = { ...simulation.steps[0]!, alternativeRoutes: [] };

    const merged = mergeStepRoutes(base, step);
    expect(merged.map((route) => route.vehicleLabel)).not.toContain('TR-08');
    expect(merged).toHaveLength(base.length - 1);
  });

  it('conserva el tramo en un contenedor crítico sin plan alternativo', () => {
    const simulation = mockDaySimulation(2);
    const base = simulation.baseRoutes;
    const step = { ...simulation.steps[1]!, alternativeRoutes: [] };

    expect(mergeStepRoutes(base, step)).toEqual(base);
  });

  it('sustituye por etiqueta las rutas que el contenedor crítico replanifica', () => {
    const simulation = mockDaySimulation(2);
    const step = simulation.steps[1]!;

    const merged = mergeStepRoutes(simulation.baseRoutes, step);
    const labels = merged.map((route) => route.vehicleLabel);

    // El vehículo no replanificado (TR-02) se conserva; los replanificados no se duplican.
    expect(labels).toContain('TR-02');
    for (const replanned of step.alternativeRoutes.map((route) => route.vehicleLabel)) {
      expect(labels.filter((value) => value === replanned)).toHaveLength(1);
    }
  });

  it('evita colisiones de routeId al anexar el plan alternativo', () => {
    const simulation = mockDaySimulation(2);
    const base = simulation.baseRoutes;
    const [alternative] = simulation.steps[0]!.alternativeRoutes;
    const step = {
      ...simulation.steps[0]!,
      alternativeRoutes: [{ ...alternative!, routeId: base[1]!.routeId }],
    };

    const merged = mergeStepRoutes(base, step);
    const ids = merged.map((route) => route.routeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('etiqueta la hora simulada del día sin depender del huso', () => {
    const routes = mockDaySimulation(2).baseRoutes;
    const atStart = simulatedDayClockLabel(routes, 0, 480);
    const atHalf = simulatedDayClockLabel(routes, 0.5, 480);

    expect(atStart).not.toBeNull();
    expect(atHalf).not.toBeNull();
    expect(atStart).not.toBe(atHalf);
    expect(elapsedOperationMinutes(0.5, 480)).toBe(240);
  });

  it('calcula la estabilidad del plan', () => {
    expect(planStabilityPct(10, 0)).toBe(100);
    expect(planStabilityPct(10, 5)).toBe(50);
    expect(planStabilityPct(0, 3)).toBeNull();
    expect(planStabilityPct(undefined, 3)).toBeNull();
  });

  it('etiqueta el impacto de cada paso', () => {
    const simulation = mockDaySimulation(2);
    const breakdown = simulation.steps[0]!;
    const critical = simulation.steps[1]!;

    expect(stepImpactLabel(breakdown)).toContain('estabilidad');
    expect(stepImpactLabel(breakdown)).toContain('3 pts reasignados');
    // El contenedor crítico no expone estabilidad (reoptimiza, no reasigna).
    expect(stepStabilityPct(critical)).toBeNull();
    expect(stepImpactLabel(critical)).toContain('sin atender');
  });

  it('filtra las rutas por camiones ocultos', () => {
    const routes = mockDaySimulation(2).baseRoutes;
    const labels = routes.map((route) => route.vehicleLabel);

    expect(filterPlaybackRoutesByLabels(routes, new Set()).length).toBe(routes.length);

    const visible = filterPlaybackRoutesByLabels(routes, new Set([labels[0]!]));
    expect(visible).toHaveLength(routes.length - 1);
    expect(visible.every((route) => route.vehicleLabel !== labels[0])).toBe(true);
  });

  it('resume los puntos sin atender por criticidad', () => {
    const summary = droppedSummary([
      { code: 'A', fillPct: 95, criticality: 'critico', priority: 165 },
      { code: 'B', fillPct: 70, criticality: 'lleno', priority: 130 },
      { code: 'C', fillPct: 90, criticality: 'critico', priority: 160 },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.byCriticality[0]).toEqual({
      criticality: 'critico',
      label: 'Crítico',
      count: 2,
    });
    expect(summary.byCriticality[1]).toEqual({ criticality: 'lleno', label: 'Lleno', count: 1 });
  });

  it('agrupa los camiones por origen y deja en espera la contingencia', () => {
    const simulation = mockDaySimulation(2);
    const baseLabels = simulation.baseRoutes.map((route) => route.vehicleLabel);

    const options = buildDayVehicleOptions(simulation, new Set(baseLabels));
    const day = options.filter((option) => option.source === 'day').map((option) => option.label);
    const contingency = options.filter((option) => option.source === 'contingency');

    // Los del día conservan el orden del plan base.
    expect(day).toEqual(baseLabels);
    // TR-11 solo vive en los planes alternativos (el TR-04 alternativo ya está en el día).
    expect(contingency.map((option) => option.label)).toEqual(['TR-11']);
    expect(contingency[0]!.pending).toBe(true);
  });

  it('activa la contingencia cuando el tramo actual ya la incluye', () => {
    const simulation = mockDaySimulation(2);
    const active = new Set([
      ...simulation.baseRoutes.map((route) => route.vehicleLabel),
      'TR-11',
    ]);

    const options = buildDayVehicleOptions(simulation, active);

    expect(options.find((option) => option.label === 'TR-11')?.pending).toBe(false);
  });

  it('no duplica como contingencia un camión que ya está en el día', () => {
    const simulation = mockDaySimulation(2);

    const labels = buildDayVehicleOptions(simulation, new Set()).map((option) => option.label);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it('deja fuera del "Ninguno" las contingencias en espera', () => {
    const simulation = mockDaySimulation(2);
    const active = new Set(simulation.baseRoutes.map((route) => route.vehicleLabel));

    const labels = inPlayVehicleLabels(buildDayVehicleOptions(simulation, active));

    expect(labels).not.toContain('TR-11');
    expect(labels).toHaveLength(simulation.baseRoutes.length);
  });
});
