import { describe, expect, it } from 'vitest';
import { defaultConditions } from '../../features/simulation/simulationConfig';
import { buildSimulationRunParameters } from './simulationWizard';

describe('buildSimulationRunParameters', () => {
  const base = {
    rainIntensity: 'alta',
    wasteLevel: '30',
    durationHours: '4',
    conditions: defaultConditions(),
    scenarioId: 'normal' as const,
  };

  it('omits operatorsShortage when crew shortage toggle is off', () => {
    expect(buildSimulationRunParameters(base)).toEqual({ estimatedDurationHours: 4 });
  });

  it('sends operatorsShortage when crew shortage is enabled', () => {
    expect(
      buildSimulationRunParameters({
        ...base,
        crewShortageEnabled: true,
        operatorsShortage: '2',
      }),
    ).toEqual({
      estimatedDurationHours: 4,
      operatorsShortage: 2,
    });
  });
});
