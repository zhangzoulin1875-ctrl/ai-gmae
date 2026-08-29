import type { ScenarioDefinition, ScenarioListItem } from '../types/scenario';
import { wwiGlobal } from './wwi-global';
import { wwiEurope } from './wwi-europe';
import { wwiiEurope } from './wwii-europe';
import { wwiiAsia } from './wwii-asia';
import { coldwarGlobal } from './coldwar-global';

export const SCENARIOS: ScenarioDefinition[] = [
  wwiGlobal,
  wwiEurope,
  wwiiEurope,
  wwiiAsia,
  coldwarGlobal,
];

export function getScenario(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function listScenarios(): ScenarioListItem[] {
  return SCENARIOS.map((s) => ({
    id: s.id,
    era: s.era,
    region: s.region,
    nameZh: s.nameZh,
    description: s.description,
    countryCount: s.countries.length,
  }));
}
