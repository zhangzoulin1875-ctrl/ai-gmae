/**
 * Warlord scenario province mapping — loads the precomputed province-to-country
 * mapping for the warlord-asia scenario (built from the scenario's GeoJSON,
 * provinceOverrides, and territoryMap).
 *
 * This lets the server initialize each warlord faction and foreign power with
 * actual province IDs as starting territories, enabling province-level combat.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const warlordData = require(join(__dirname, '..', 'data', 'warlord-provinces.json'));
const PROVINCE_TO_COUNTRY: Record<string, string> = warlordData.provinceToCountry;

/**
 * Get all province IDs assigned to a given country in the warlord scenario.
 */
export function getWarlordProvincesForCountry(countryId: string): string[] {
  return Object.entries(PROVINCE_TO_COUNTRY)
    .filter(([, cId]) => cId === countryId)
    .map(([pId]) => pId);
}

/**
 * Get the full province-to-country map for the warlord scenario.
 */
export function getWarlordProvinceMap(): Record<string, string> {
  return PROVINCE_TO_COUNTRY;
}
