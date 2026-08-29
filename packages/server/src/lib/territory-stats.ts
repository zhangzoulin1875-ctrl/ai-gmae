/**
 * Territory stats — computes real area (km²) and population for any set
 * of territory IDs, using precomputed per-province data derived from the
 * 1914 GeoJSON map + historical population estimates.
 *
 * Territory IDs can be either:
 *   - Province IDs (e.g. "DEU-1579") — looks up per-province area/population
 *   - Country IDs (e.g. "deu") — looks up country-level aggregate area/population
 *
 * This dual support lets turn-0 init pass a country ID directly, while
 * mid-game CountryState.territories may hold either format depending on
 * the conquest system. The function handles both transparently.
 *
 * NOTE: We use createRequire() to load the JSON data file instead of a
 * static import, because Node.js ESM requires import assertions for JSON
 * which TypeScript's bundler moduleResolution doesn't emit. This keeps
 * it compatible with both tsx (dev) and node (production).
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Load the precomputed province statistics
const provinceData = require(join(__dirname, '..', 'data', 'province-stats.json'));

const PROVINCE_AREA: Record<string, number> = provinceData.provinceArea;
const PROVINCE_POPULATION: Record<string, number> = provinceData.provincePopulation;
const PROVINCE_TO_COUNTRY: Record<string, string> = provinceData.provinceToCountry;
const COUNTRY_AREA: Record<string, number> = provinceData.countryArea;
const COUNTRY_POPULATION: Record<string, number> = provinceData.countryPopulation;

export interface TerritoryStats {
  areaKm2: number;
  population: number;
}

/**
 * Sum area and population for a list of territory IDs (province or country).
 * Pass a country's `territories` array to get its real current area + population.
 */
export function getTerritoryStats(territoryIds: string[]): TerritoryStats {
  let areaKm2 = 0;
  let population = 0;

  for (const id of territoryIds) {
    // Try province-level first
    if (id in PROVINCE_AREA) {
      areaKm2 += PROVINCE_AREA[id];
      population += PROVINCE_POPULATION[id] || 0;
    }
    // Try country-level aggregate
    else if (id in COUNTRY_AREA) {
      areaKm2 += COUNTRY_AREA[id];
      population += COUNTRY_POPULATION[id] || 0;
    }
    // Unknown — skip (defensive)
  }

  return { areaKm2, population };
}

/**
 * Get all province IDs that belong to a given country ID.
 */
export function getProvincesForCountry(countryId: string): string[] {
  return Object.entries(PROVINCE_TO_COUNTRY)
    .filter(([, cId]) => cId === countryId)
    .map(([pId]) => pId);
}

/**
 * Get the full province area map (for admin/debug display).
 */
export function getProvinceAreaMap(): Record<string, number> {
  return PROVINCE_AREA;
}

/**
 * Get the full province population map (for admin/debug display).
 */
export function getProvincePopulationMap(): Record<string, number> {
  return PROVINCE_POPULATION;
}

/**
 * Get the country-level area map.
 */
export function getCountryAreaMap(): Record<string, number> {
  return COUNTRY_AREA;
}

/**
 * Get the country-level population map.
 */
export function getCountryPopulationMap(): Record<string, number> {
  return COUNTRY_POPULATION;
}
