import { describe, expect, it } from 'vitest';
import { defaultConditions } from '../../features/simulation/simulationConfig';
import { buildSimulationRunParameters } from './simulationWizard';

describe('buildSimulationRunParameters', () => {
  const base = {
    rainIntensity: 'alta',
    wasteLevel: '30',
    durationHours: '12',
    conditions: defaultConditions(),
    scenarioId: 'normal' as const,
  };

  it('omits operatorsShortage when crew shortage toggle is off', () => {
    expect(buildSimulationRunParameters(base)).toEqual({
      estimatedDurationHours: 12,
      acoAnts: 12,
      acoIterations: 20,
    });
  });

  it('sends operatorsShortage when crew shortage is enabled', () => {
    expect(
      buildSimulationRunParameters({
        ...base,
        crewShortageEnabled: true,
        operatorsShortage: '2',
      }),
    ).toEqual({
      estimatedDurationHours: 12,
      operatorsShortage: 2,
      acoAnts: 12,
      acoIterations: 20,
    });
  });

  it('sends custom aco parameters', () => {
    expect(
      buildSimulationRunParameters({
        ...base,
        acoAnts: '6',
        acoIterations: '10',
      }),
    ).toEqual({
      estimatedDurationHours: 12,
      acoAnts: 6,
      acoIterations: 10,
    });
  });
});
