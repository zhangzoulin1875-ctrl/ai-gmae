import { WWI_COUNTRIES } from '@wwi/shared';
import { getTerritoryStats, getProvincesForCountry } from '../lib/territory-stats.js';
import { prisma } from '../lib/prisma.js';
import { ensureSystemUnits } from './military-init.js';

/**
 * Industrial development factor per country — represents per-capita
 * industrialization level in 1914. Higher = more industry output per
 * million population.
 *
 * Tier 1 (1.2): Fully industrialized great powers
 * Tier 2 (0.8): Partially industrialized great powers
 * Tier 3 (0.5): Semi-industrialized / resource economies
 * Tier 4 (0.2): Primarily agrarian / developing
 *
 * These are MULTIPLIERS on the population-derived industry formula,
 * so Germany (pop 67M, D=1.2) gets much more industry than China
 * (pop 430M, D=0.2) despite China's vastly larger population.
 */
const DEV_FACTOR: Record<string, number> = {
  // Tier 1 — fully industrialized
  deu: 1.2, gbr: 1.2, usa: 1.2, fra: 1.2,
  // Tier 2 — partially industrialized great powers
  aut: 0.8, rus: 0.8, jpn: 0.8, ita: 0.8,
  // Tier 3 — semi-industrialized / resource economies
  tur: 0.5, can: 0.5, aus: 0.5, zaf: 0.5, ind: 0.5, prt: 0.5,
  bra: 0.5, mex: 0.5, arg: 0.5, chl: 0.5, esp: 0.5, swe: 0.5,
  nor: 0.5, dnk: 0.5, nld: 0.5, bel: 0.5, rou: 0.5, grc: 0.5,
  bgr: 0.5, srb: 0.5, tha: 0.5, egy: 0.5, col: 0.5, per: 0.5,
  ven: 0.5, nzl: 0.5,
  // Tier 4 — primarily agrarian (default)
  chn: 0.2, irn: 0.2, afg: 0.2, eth: 0.2, sau: 0.2, nej: 0.2,
  alb: 0.2, mne: 0.2, cub: 0.2, hti: 0.2, lbr: 0.2, pan: 0.2,
  cri: 0.2, gtm: 0.2, hnd: 0.2, nic: 0.2, ury: 0.2, bol: 0.2,
  pry: 0.2, che: 0.4, // Switzerland: small but moderately developed
};

/**
 * Starting morale/stability baseline by side — these represent
 * political conditions at war outbreak, not economic capacity,
 * so they stay tiered rather than population-driven.
 */
const SIDE_MORALE: Record<string, number> = {
  central: 75,  // Central Powers — well-prepared, high initial morale
  entente: 75,   // Entente — same for major powers
  allies: 65,    // Co-belligerents — joining the fight
  neutral: 60,   // Neutrals — stable but unmotivated
};

/**
 * Compute initial resources for a country based on its real territory
 * area + 1914 population + industrial development factor.
 *
 * Formula design (constants chosen to keep major powers in the same
 * ballpark as the old hardcoded values: ~500 gold, ~2M manpower,
 * ~50 industry, ~500k infantry for Germany):
 *
 *   industry  = clamp(round(pop / 1M * 0.5 * D_c), 5, 150)
 *   manpower  = round(pop * 0.025)                      — 2.5% mobilizable reserve
 *   gold      = round(pop / 100K * 0.5 + area / 10K * 0.3)
 *   infantry  = round(pop * 0.006)                     — 0.6% standing army
 *   artillery = round(infantry / 1000 * D_c)           — proportional, tech-scaled
 *   cavalry   = round(infantry / 5000)                 — smaller mounted contingent
 */
function computeInitialResources(countryId: string, areaKm2: number, population: number) {
  const D = DEV_FACTOR[countryId] ?? 0.2;
  const side = WWI_COUNTRIES.find(c => c.id === countryId)?.side ?? 'neutral';

  const industry = Math.min(150, Math.max(5, Math.round((population / 1_000_000) * 0.5 * D)));
  const manpower = Math.round(population * 0.025);
  const gold = Math.round((population / 100_000) * 0.5 + (areaKm2 / 10_000) * 0.3);
  const infantry = Math.round(population * 0.006);
  const artillery = Math.round((infantry / 1000) * D);
  const cavalry = Math.round(infantry / 5000);
  const morale = SIDE_MORALE[side] ?? 60;
  const stability = SIDE_MORALE[side] ?? 60;

  return { industry, manpower, gold, infantry, artillery, cavalry, morale, stability };
}

export async function initializeGameCountries(gameId: string): Promise<void> {
  const sysUnits = await ensureSystemUnits();

  const records = WWI_COUNTRIES.map((c) => {
    // Compute real territory stats — at turn 0 each country owns all
    // provinces assigned to it in the geojson. getTerritoryStats supports
    // country IDs directly (looks up country-level aggregate area + pop).
    const stats = getTerritoryStats([c.id]);
    const population = stats.population;
    const areaKm2 = stats.areaKm2;

    const resources = computeInitialResources(c.id, areaKm2, population);

    return {
      gameId, countryId: c.id, turn: 0,
      infantry: resources.infantry,
      artillery: resources.artillery,
      cavalry: resources.cavalry,
      morale: resources.morale,
      gold: resources.gold,
      industry: resources.industry,
      manpower: resources.manpower,
      stability: resources.stability,
      territories: getProvincesForCountry(c.id),
      isAIControlled: false,
      playerId: null,
    };
  });

  await prisma.countryState.createMany({ data: records });

  // Create CountryUnitStock & initial Division for each country
  for (const rec of records) {
    await prisma.countryUnitStock.createMany({
      data: [
        { gameId, countryId: rec.countryId, customUnitId: sysUnits.infantry.id, quantity: 0 },
        { gameId, countryId: rec.countryId, customUnitId: sysUnits.artillery.id, quantity: 0 },
        { gameId, countryId: rec.countryId, customUnitId: sysUnits.cavalry.id, quantity: 0 },
      ],
      skipDuplicates: true,
    });

    const composition: Record<string, number> = {};
    if (rec.infantry > 0) composition[sysUnits.infantry.id] = rec.infantry;
    if (rec.artillery > 0) composition[sysUnits.artillery.id] = rec.artillery;
    if (rec.cavalry > 0) composition[sysUnits.cavalry.id] = rec.cavalry;

    await prisma.division.create({
      data: {
        gameId,
        countryId: rec.countryId,
        name: '主力部隊',
        composition,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`[GameInit] Initialized ${records.length} country states, unit stocks, and starting divisions for game ${gameId}`);
}
