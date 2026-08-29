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
  /** Optional: custom GeoJSON URL for this scenario (e.g. Asia-only map).
   * If omitted, defaults to the global provinces-1914.geojson. */
  geojsonUrl?: string;
  /** Optional province-level overrides keyed by GeoJSON feature ID.
   * Applied AFTER territoryMap to split a single country among multiple factions. */
  provinceOverrides?: Record<string, string>;
}

export interface ScenarioListItem {
  id: string;
  era: string;
  region: string;
  nameZh: string;
  description: string;
  countryCount: number;
}
