import { prisma } from '../lib/prisma.js';
import { AIEngine } from './ai-engine.js';
import { WWI_COUNTRIES } from '@wwi/shared';
import type { AIProvider } from '@wwi/shared';

export class AIPlayerService {
  /**
   * Generate strategic orders for all AI-controlled countries in a game and turn.
   */
  async generateOrdersForGame(gameId: string, turn: number): Promise<void> {
    // 1. Guard: Load latest country states for this game & turn
    const allCountryStates = await prisma.countryState.findMany({
      where: { gameId, turn },
    });

    if (allCountryStates.length === 0) {
      console.log(`[AIPlayer] No country states found for game ${gameId} turn ${turn}`);
      return;
    }

    // Guard: Filter countries where isAIControlled === true in the latest CountryState
    const aiCountryStates = allCountryStates.filter((cs) => cs.isAIControlled);

    if (aiCountryStates.length === 0) {
      console.log(`[AIPlayer] No AI-controlled countries found for game ${gameId} turn ${turn}`);
      return;
    }

    // 2. Load AI provider configs from Prisma
    const dbConfigs = await prisma.aIProviderConfig.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
    });

    const activeProviders: AIProvider[] = dbConfigs
      .map((cfg) => ({
        id: cfg.id,
        name: cfg.name,
        type: cfg.type as any,
        apiKey: cfg.apiKeyEnc || process.env.OPENAI_API_KEY || '',
        endpoint: cfg.endpoint || undefined,
        model: cfg.model,
        priority: cfg.priority,
        isEnabled: cfg.isEnabled,
        timeoutMs: cfg.timeoutMs,
        maxRetries: cfg.maxRetries,
      }))
      .filter((p) => Boolean(p.apiKey));

    // Fallback check: environment variables
    if (activeProviders.length === 0 && process.env.OPENAI_API_KEY) {
      activeProviders.push({
        id: 'env-openai',
        name: 'OpenAI (env)',
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        priority: 1,
        isEnabled: true,
        timeoutMs: 30000,
        maxRetries: 2,
      });
    }

    const aiEngine = activeProviders.length > 0
      ? new AIEngine({
          providers: activeProviders,
          enableDeterministicFallback: false,
          maxTotalTimeoutMs: 30000,
        })
      : null;

    for (const aiState of aiCountryStates) {
      // Check if PENDING orders already exist for this AI country on this turn
      const existingOrders = await prisma.order.findMany({
        where: { gameId, countryId: aiState.countryId, turn, status: 'PENDING' },
      });

      if (existingOrders.length > 0) {
        console.log(`[AIPlayer] Pending orders already exist for AI country ${aiState.countryId} in turn ${turn}`);
        continue;
      }

      let generatedOrders: Array<{
        type: string;
        targetTerritoryId?: string | null;
        fromTerritoryId?: string | null;
        infantry?: number | null;
        artillery?: number | null;
        cavalry?: number | null;
        details?: string | null;
      }> = [];

      // Try LLM generation if AI engine exists
      if (aiEngine) {
        try {
          generatedOrders = await aiEngine.generateAIOrders(turn, aiState as any, allCountryStates as any);
        } catch (err: any) {
          console.warn(`[AIPlayer] AI LLM order generation failed for ${aiState.countryId}: ${err.message}, falling back to heuristic`);
          generatedOrders = [];
        }
      }

      // If LLM returned no orders or failed / no AI config, use heuristic logic
      if (generatedOrders.length === 0) {
        generatedOrders = this.generateHeuristicOrders(aiState, allCountryStates);
      }

      // Ensure 1-2 strategic orders max
      const finalOrders = generatedOrders.slice(0, 2);

      for (const order of finalOrders) {
        await prisma.order.create({
          data: {
            gameId,
            playerId: aiState.playerId || `ai-${aiState.countryId}`,
            countryId: aiState.countryId,
            turn,
            type: order.type,
            fromTerritoryId: order.fromTerritoryId || aiState.territories[0] || aiState.countryId,
            targetTerritoryId: order.targetTerritoryId || null,
            infantry: order.infantry || null,
            artillery: order.artillery || null,
            cavalry: order.cavalry || null,
            details: order.details || 'AI 戰略指令',
            status: 'PENDING',
            isAIOrder: true,
          },
        });
      }

      console.log(`[AIPlayer] Generated ${finalOrders.length} AI orders for ${aiState.countryId} (Turn ${turn})`);
    }
  }

  /**
   * Heuristic logic for AI country orders when no AI config / API key is available.
   * - High infantry (>300k) and low morale (<50) -> DEFEND
   * - High infantry (>300k) and high morale (>=50) -> ATTACK nearest enemy or RECRUIT
   * - Low gold (<10) -> skip (can't afford)
   * - Random element for unpredictability
   */
  private generateHeuristicOrders(
    countryState: any,
    allStates: any[]
  ): Array<{
    type: string;
    targetTerritoryId?: string | null;
    fromTerritoryId?: string | null;
    infantry?: number | null;
    artillery?: number | null;
    cavalry?: number | null;
    details?: string | null;
  }> {
    const countryId = countryState.countryId;
    const countryDef = WWI_COUNTRIES.find((c) => c.id === countryId);
    const countrySide = countryDef?.side || 'neutral';

    // Check low gold: skip if country has low gold (< 10)
    if (countryState.gold < 10) {
      console.log(`[AIPlayer] AI country ${countryId} has low gold (${countryState.gold}), skipping order creation`);
      return [];
    }

    const highInfantry = countryState.infantry > 300000;
    const lowMorale = countryState.morale < 50;
    const highMorale = countryState.morale >= 50;

    const roll = Math.random();
    const orders: any[] = [];

    // Find potential enemy targets
    const enemyTerritories: string[] = [];
    for (const other of allStates) {
      if (other.countryId === countryId) continue;
      const otherDef = WWI_COUNTRIES.find((c) => c.id === other.countryId);
      const otherSide = otherDef?.side || 'neutral';

      const isEnemy =
        (countrySide === 'central' && (otherSide === 'entente' || otherSide === 'allies')) ||
        ((countrySide === 'entente' || countrySide === 'allies') && otherSide === 'central') ||
        (countrySide !== 'neutral' && otherSide === 'neutral' && roll < 0.2);

      if (isEnemy && Array.isArray(other.territories)) {
        enemyTerritories.push(...other.territories);
      }
    }

    // 1. High infantry (>300k) and low morale (<50) -> DEFEND
    if (highInfantry && lowMorale) {
      if (roll < 0.8) {
        orders.push({
          type: 'DEFEND',
          fromTerritoryId: countryState.territories[0] || countryId,
          details: '兵力充足但士氣低落,全線收縮防守以整頓士氣',
        });
      } else {
        orders.push({
          type: 'FORTIFY',
          fromTerritoryId: countryState.territories[0] || countryId,
          details: '修築前線工事 solidify defenses',
        });
      }
    }
    // 2. High infantry (>300k) and high morale (>=50) -> ATTACK nearest enemy or RECRUIT
    else if (highInfantry && highMorale) {
      if (roll < 0.65 && enemyTerritories.length > 0) {
        const target = enemyTerritories[Math.floor(Math.random() * enemyTerritories.length)];
        const commitInf = Math.floor(countryState.infantry * (0.3 + Math.random() * 0.3));
        orders.push({
          type: 'ATTACK',
          fromTerritoryId: countryState.territories[0] || countryId,
          targetTerritoryId: target,
          infantry: commitInf,
          artillery: Math.floor((countryState.artillery || 0) * 0.5),
          cavalry: Math.floor((countryState.cavalry || 0) * 0.5),
          details: `兵精糧足,向 ${target} 發起全面進攻`,
        });
      } else {
        const recruitAmount = Math.min(20000, Math.floor((countryState.manpower || 100000) * 0.1) || 10000);
        orders.push({
          type: 'RECRUIT',
          fromTerritoryId: countryState.territories[0] || countryId,
          infantry: recruitAmount,
          details: `擴充兵源,徵兵 ${recruitAmount.toLocaleString()} 人`,
        });
      }
    }
    // 3. Moderate / Low infantry -> RECRUIT, FORTIFY or DEFEND with random element
    else {
      if (roll < 0.45 && countryState.gold >= 30 && (countryState.manpower || 0) >= 10000) {
        const recruitAmount = 10000;
        orders.push({
          type: 'RECRUIT',
          fromTerritoryId: countryState.territories[0] || countryId,
          infantry: recruitAmount,
          details: `補充新兵 ${recruitAmount.toLocaleString()} 人`,
        });
      } else if (roll < 0.75) {
        orders.push({
          type: 'DEFEND',
          fromTerritoryId: countryState.territories[0] || countryId,
          details: '保持戰略守勢',
        });
      } else if (enemyTerritories.length > 0 && countryState.infantry >= 40000) {
        const target = enemyTerritories[Math.floor(Math.random() * enemyTerritories.length)];
        orders.push({
          type: 'ATTACK',
          fromTerritoryId: countryState.territories[0] || countryId,
          targetTerritoryId: target,
          infantry: Math.floor(countryState.infantry * 0.4),
          details: `試探性進攻 ${target}`,
        });
      } else {
        orders.push({
          type: 'FORTIFY',
          fromTerritoryId: countryState.territories[0] || countryId,
          details: '加固工事',
        });
      }
    }

    // Random second order if resources allow
    if (orders.length === 1 && countryState.gold >= 40 && Math.random() < 0.35) {
      if (orders[0].type !== 'FORTIFY') {
        orders.push({
          type: 'FORTIFY',
          fromTerritoryId: countryState.territories[0] || countryId,
          details: '輔助指令:加強防禦',
        });
      }
    }

    return orders;
  }
}
