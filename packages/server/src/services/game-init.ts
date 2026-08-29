import { getScenario } from '@wwi/shared';
import type { ScenarioCountry } from '@wwi/shared';
import { prisma } from '../lib/prisma.js';

export async function initializeGameCountries(gameId: string, scenarioId: string): Promise<void> {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  const records = scenario.countries.map((c: ScenarioCountry) => {
    const tier = c.tier || 'minor';
    if (tier === 'major') {
      return {
        gameId, countryId: c.id, turn: 0,
        infantry: 500000, artillery: 500, cavalry: 100,
        morale: 70, gold: 500, industry: 50, manpower: 2000000, stability: 70,
        territories: [], isAIControlled: false, playerId: null,
      };
    } else if (tier === 'secondary') {
      return {
        gameId, countryId: c.id, turn: 0,
        infantry: 200000, artillery: 200, cavalry: 50,
        morale: 60, gold: 200, industry: 20, manpower: 800000, stability: 60,
        territories: [], isAIControlled: false, playerId: null,
      };
    } else {
      return {
        gameId, countryId: c.id, turn: 0,
        infantry: 100000, artillery: 100, cavalry: 30,
        morale: 50, gold: 100, industry: 10, manpower: 400000, stability: 50,
        territories: [], isAIControlled: false, playerId: null,
      };
    }
  });

  await prisma.countryState.createMany({ data: records });
  console.log(`[GameInit] Initialized ${records.length} country states for game ${gameId} (scenario: ${scenarioId})`);
}
