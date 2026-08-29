import { CountrySide } from './game';

export interface ScenarioCountry {
  id: string;
  name: string;
  nameZh: string;
  code: string;
  color: string;
  side: CountrySide;
  capital: string;
  capitalZh: string;
  flagIcon: string;
  tier: 'major' | 'secondary' | 'minor';
}

export interface ScenarioDefinition {
  id: string;
  era: string;
  region: string;
  nameZh: string;
  description: string;
  mapBounds: [[number, number], [number, number]];
  countries: ScenarioCountry[];
  territoryMap: Record<string, string>;
}

export interface ScenarioListItem {
  id: string;
  era: string;
  region: string;
  nameZh: string;
  description: string;
  countryCount: number;
}
