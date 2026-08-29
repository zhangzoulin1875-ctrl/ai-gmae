import { WWI_COUNTRIES, getScenario } from '@wwi/shared';
import type { ScenarioCountry } from '@wwi/shared';
import { getTerritoryStats, getProvincesForCountry } from '../lib/territory-stats.js';
import { prisma } from '../lib/prisma.js';
import { ensureSystemUnits } from './military-init.js';

/**
 * Industrial development factor per country — represents per-capita
 * industrialization level. Higher = more industry output per
 * million population.
 *
 * Tier 1 (1.2): Fully industrialized great powers
 * Tier 2 (0.8): Partially industrialized great powers
 * Tier 3 (0.5): Semi-industrialized / resource economies
 * Tier 4 (0.2): Primarily agrarian / developing
 * Tier 5 (0.1): Near-zero industrialization (warlord factions)
 */
const DEV_FACTOR: Record<string, number> = {
  // Tier 1 — fully industrialized
  deu: 1.2, gbr: 1.2, usa: 1.2, fra: 1.2,
  // Tier 2 — partially industrialized great powers
  aut: 0.8, rus: 0.8, rus_cw: 0.6, jpn: 0.8, ita: 0.8,
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
  pry: 0.2, che: 0.4,
  // Tier 5 — warlord factions (very low industrialization, mostly agrarian armies)
  wm_anhui: 0.15, wm_zhili: 0.15, wm_fengtian: 0.2, wm_kmt: 0.15,
  wm_yunnan: 0.1, wm_guangxi: 0.1, wm_sichuan: 0.1, wm_xinjiang: 0.05,
  wm_mongolia: 0.05, wm_shanxi: 0.15,
};

/**
 * Estimated population (in millions) for warlord-era factions.
 * Since these don't exist in the province-stats.json (which uses
 * real country IDs like 'chn'), we provide manual estimates based
 * on the population of their controlled provinces circa 1920.
 */
const WARLORD_POPULATION_M: Record<string, number> = {
  wm_anhui: 80,      // Beijing, Tianjin, Hebei, Shandong, Anhui, Jiangsu, Shanghai, Zhejiang, Fujian (~80M)
  wm_zhili: 60,      // Henan, Hubei, Hunan, Jiangxi (~60M)
  wm_fengtian: 20,   // Liaoning, Jilin, Heilongjiang (~20M)
  wm_kmt: 35,        // Guangdong, Hainan, Tibet (~35M)
  wm_yunnan: 15,      // Yunnan, Guizhou (~15M)
  wm_guangxi: 12,     // Guangxi (~12M)
  wm_sichuan: 50,     // Sichuan, Chongqing (~50M)
  wm_xinjiang: 5,     // Xinjiang, Qinghai (~5M)
  wm_mongolia: 3,     // Inner Mongolia (~3M)
  wm_shanxi: 15,      // Shanxi, Shaanxi, Gansu, Ningxia (~15M)
};

/**
 * Estimated territory area (km²) for warlord factions.
 */
const WARLORD_AREA_KM2: Record<string, number> = {
  wm_anhui: 700000,
  wm_zhili: 550000,
  wm_fengtian: 800000,
  wm_kmt: 1900000,   // includes Tibet
  wm_yunnan: 470000,
  wm_guangxi: 237000,
  wm_sichuan: 565000,
  wm_xinjiang: 1900000,
  wm_mongolia: 1200000,
  wm_shanxi: 680000,
};

const BASE_MORALE = 65;

function computeInitialResources(countryId: string, areaKm2: number, population: number) {
  const D = DEV_FACTOR[countryId] ?? 0.2;

  const industry = Math.min(150, Math.max(3, Math.round((population / 1_000_000) * 0.5 * D)));
  const manpower = Math.round(population * 0.025);
  const gold = Math.round((population / 100_000) * 0.5 + (areaKm2 / 10_000) * 0.3);
  const infantry = Math.round(population * 0.006);
  const artillery = Math.round((infantry / 1000) * D);
  const cavalry = Math.round(infantry / 5000);
  const morale = BASE_MORALE;
  const stability = BASE_MORALE;

  return { industry, manpower, gold, infantry, artillery, cavalry, morale, stability };
}

/**
 * Get population and area for a country, using either the precomputed
 * province stats (for real countries) or manual estimates (for warlord
 * factions that don't exist in province-stats.json).
 */
function getCountryStats(countryId: string): { areaKm2: number; population: number } {
  // Check if this is a warlord faction with manual estimates
  if (WARLORD_POPULATION_M[countryId]) {
    return {
      areaKm2: WARLORD_AREA_KM2[countryId] || 500000,
      population: WARLORD_POPULATION_M[countryId] * 1_000_000,
    };
  }

  // Use precomputed province stats for real countries
  const stats = getTerritoryStats([countryId]);
  return { areaKm2: stats.areaKm2, population: stats.population };
}

/**
 * Get the list of provinces for a country.
 * For warlord factions, we return an empty array (territory tracking
 * will be handled by the scenario's provinceOverrides on the client side).
 * For real countries, we use the precomputed province-to-country map.
 */
function getCountryProvinces(countryId: string): string[] {
  if (countryId.startsWith('wm_')) {
    return [countryId]; // warlord factions use their own ID as territory
  }
  return getProvincesForCountry(countryId);
}

export async function initializeGameCountries(gameId: string, scenarioId?: string): Promise<void> {
  const sysUnits = await ensureSystemUnits();

  // Determine which countries to use based on the scenario
  const scenario = scenarioId ? getScenario(scenarioId) : undefined;
  const countryList: { id: string; nameZh: string }[] = scenario
    ? scenario.countries.map((c) => ({ id: c.id, nameZh: c.nameZh }))
    : WWI_COUNTRIES.map((c) => ({ id: c.id, nameZh: c.nameZh }));

  const records = countryList.map((c) => {
    const { areaKm2, population } = getCountryStats(c.id);
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
      territories: getCountryProvinces(c.id),
      isAIControlled: false,
      playerId: null,
      techPoints: 50,
      unlockedTechIds: [],
      politicalBranch: null,
      techEffects: undefined as any,
      customName: null,
      hasRenamed: false,
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

  console.log(`[GameInit] Initialized ${records.length} country states for scenario "${scenarioId || 'wwi-global'}" in game ${gameId}`);
}
