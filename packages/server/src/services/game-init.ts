import { WWI_COUNTRIES } from '@wwi/shared';
import { prisma } from '../lib/prisma.js';

const MAJOR_POWERS = new Set(['deu', 'aut', 'tur', 'gbr', 'fra', 'rus', 'ita', 'usa', 'jpn']);

export async function initializeGameCountries(gameId: string): Promise<void> {
  const records = WWI_COUNTRIES.map((c) => {
    const isMajor = MAJOR_POWERS.has(c.id);
    const isSecondary = ['bgr', 'srb', 'bel', 'rou', 'grc', 'mne', 'can', 'aus', 'nzl', 'zaf', 'ind', 'prt', 'chn', 'tha', 'bra', 'cub', 'egy', 'sau'].includes(c.id);

    if (isMajor) {
      return {
        gameId, countryId: c.id, turn: 0,
        infantry: 500000, artillery: 500, cavalry: 100,
        morale: 70, gold: 500, industry: 50, manpower: 2000000, stability: 70,
        territories: [c.id], isAIControlled: false, playerId: null,
      };
    } else if (isSecondary) {
      return {
        gameId, countryId: c.id, turn: 0,
        infantry: 200000, artillery: 200, cavalry: 50,
        morale: 60, gold: 200, industry: 20, manpower: 800000, stability: 60,
        territories: [c.id], isAIControlled: false, playerId: null,
      };
    } else {
      return {
        gameId, countryId: c.id, turn: 0,
        infantry: 100000, artillery: 100, cavalry: 30,
        morale: 50, gold: 100, industry: 10, manpower: 400000, stability: 50,
        territories: [c.id], isAIControlled: false, playerId: null,
      };
    }
  });

  await prisma.countryState.createMany({ data: records });
  console.log(`[GameInit] Initialized ${records.length} country states for game ${gameId}`);
}
