import type { CaseStudyDetail } from '../api/caseStudies';
import type { ScenarioId } from '../../data/types/simulation';
import { conditionsForScenario } from '../../features/simulation/simulationConfig';

export interface CaseStudyWizardSetters {
  applyScenario: (scenarioId: ScenarioId) => void;
  setConditions: (conditions: ReturnType<typeof conditionsForScenario>) => void;
  setDuration: (value: string) => void;
  setCrewShortageEnabled: (value: boolean) => void;
  setOperatorsShortage: (value: string) => void;
  setWasteLevel: (value: string) => void;
  setAcoAnts: (value: string) => void;
  setAcoIterations: (value: string) => void;
}

export function applyCaseStudyToWizard(detail: CaseStudyDetail, setters: CaseStudyWizardSetters): void {
  setters.applyScenario(detail.defaultScenarioId);
  setters.setConditions(conditionsForScenario(detail.defaultScenarioId));
  const defaults = detail.defaultParameters ?? {};
  if (defaults.acoAnts != null) setters.setAcoAnts(String(defaults.acoAnts));
  if (defaults.acoIterations != null) setters.setAcoIterations(String(defaults.acoIterations));
  if (defaults.estimatedDurationHours != null) {
    setters.setDuration(String(defaults.estimatedDurationHours));
  }
  if (defaults.operatorsShortage != null && defaults.operatorsShortage > 0) {
    setters.setCrewShortageEnabled(true);
    setters.setOperatorsShortage(String(defaults.operatorsShortage));
  } else {
    setters.setCrewShortageEnabled(false);
  }
  if (defaults.wasteLevelPct != null) setters.setWasteLevel(String(defaults.wasteLevelPct));
}

export function caseStudyLabelFromDetail(detail: CaseStudyDetail | null | undefined): string | null {
  if (!detail) return null;
  return detail.code;
}
