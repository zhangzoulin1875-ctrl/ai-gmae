import { prisma } from '../lib/prisma.js';
import { AIEngine } from './ai-engine.js';
import { RuleBasedAI } from './rule-based-ai.js';
import { WWI_COUNTRIES, getScenario, recruitCost } from '@wwi/shared';
import type { AIProvider } from '@wwi/shared';

const MAX_LLM_CALLS_PER_TURN = parseInt(process.env.MAX_LLM_CALLS_PER_TURN || '2', 10);

export class AIPlayerService {
  async generateOrdersForGame(gameId: string, turn: number): Promise<void> {
    const allCountryStates = await prisma.countryState.findMany({ where: { gameId, turn } });
    if (allCountryStates.length === 0) return;

    const aiCountryStates = allCountryStates.filter((cs) => cs.isAIControlled);
    if (aiCountryStates.length === 0) return;

    const aiPlayers = await prisma.player.findMany({ where: { gameId, isAI: true } });
    const playerModeMap = new Map<string, string>();
    for (const p of aiPlayers) playerModeMap.set(p.countryId, p.aiPersonality || 'formula');

    const formulaStates: typeof aiCountryStates = [];
    const llmStates: typeof aiCountryStates = [];

    for (const cs of aiCountryStates) {
      const existing = await prisma.order.findMany({
        where: { gameId, countryId: cs.countryId, turn, status: 'PENDING' },
      });
      if (existing.length > 0) continue;

      const mode = playerModeMap.get(cs.countryId) || 'formula';
      if (mode === 'llm') llmStates.push(cs);
      else formulaStates.push(cs);
    }

    console.log(`[AIPlayer] Turn ${turn}: ${formulaStates.length} formula, ${llmStates.length} LLM`);

    // Ensure AI countries have divisions
    await this.ensureAIDivisions(gameId, [...formulaStates, ...llmStates]);

    // Build alliance map: countryId -> Set of ally countryIds
    const allianceMembers = await prisma.allianceMember.findMany({
      where: { gameId, status: { in: ['MEMBER', 'LEADER'] } },
    });
    const allianceMap = new Map<string, Set<string>>();
    const allianceGroups = new Map<string, string[]>();
    for (const m of allianceMembers) {
      if (!allianceGroups.has(m.allianceId)) allianceGroups.set(m.allianceId, []);
      allianceGroups.get(m.allianceId)!.push(m.countryId);
    }
    for (const [, members] of allianceGroups) {
      for (const cid of members) {
        if (!allianceMap.has(cid)) allianceMap.set(cid, new Set());
        for (const ally of members) {
          if (ally !== cid) allianceMap.get(cid)!.add(ally);
        }
      }
    }

    const ruleAI = new RuleBasedAI();
    for (const cs of formulaStates) {
      const orders = await this.generateDivisionOrders(gameId, cs, allCountryStates, turn, ruleAI, allianceMap);
      await this.persistOrders(gameId, cs, turn, orders);
    }

    if (llmStates.length > 0 && MAX_LLM_CALLS_PER_TURN >= 1) {
      const providers = await this.getActiveProviders();
      if (providers.length > 0) {
        const aiEngine = new AIEngine({
          providers,
          enableDeterministicFallback: false,
          maxTotalTimeoutMs: 45000,
        });

        let llmOrdersMap: Record<string, Array<any>> = {};
        try {
          llmOrdersMap = await aiEngine.generateBatchAIOrders(
            turn,
            llmStates.map((cs) => ({
              countryId: cs.countryId,
              infantry: cs.infantry, artillery: cs.artillery, cavalry: cs.cavalry,
              morale: cs.morale, gold: cs.gold, industry: cs.industry,
              manpower: cs.manpower, stability: cs.stability,
              territories: cs.territories as string[],
            })),
            allCountryStates
          );
        } catch (e: any) {
          console.warn('[AIPlayer] LLM batch failed:', e.message);
        }

        for (const cs of llmStates) {
          let orders = llmOrdersMap[cs.countryId] || [];
          if (orders.length === 0) {
            orders = await this.generateDivisionOrders(gameId, cs, allCountryStates, turn, ruleAI);
          }
          await this.persistOrders(gameId, cs, turn, orders);
        }
      } else {
        for (const cs of llmStates) {
          const orders = await this.generateDivisionOrders(gameId, cs, allCountryStates, turn, ruleAI);
          await this.persistOrders(gameId, cs, turn, orders);
        }
      }
    }

    console.log(`[AIPlayer] Turn ${turn} complete`);
  }

  /**
   * Ensure AI-controlled countries have at least one active division.
   * If they have stockpile but no division, create one automatically.
   */
  private async ensureAIDivisions(gameId: string, aiStates: any[]): Promise<void> {
    for (const cs of aiStates) {
      const divCount = await prisma.division.count({
        where: { gameId, countryId: cs.countryId, status: 'ACTIVE' },
      });

      if (divCount === 0) {
        // Check stockpile
        const stocks = await prisma.countryUnitStock.findMany({
          where: { gameId, countryId: cs.countryId },
        });

        const composition: Record<string, number> = {};
        for (const s of stocks) {
          if (s.quantity > 0) composition[s.customUnitId] = s.quantity;
        }

        if (Object.keys(composition).length > 0) {
          // Move all stock into a division
          await prisma.division.create({
            data: {
              gameId,
              countryId: cs.countryId,
              name: 'AI 防衛軍',
              composition,
              status: 'ACTIVE',
            },
          });

          // Clear stockpile (units are now in the division)
          for (const s of stocks) {
            await prisma.countryUnitStock.update({
              where: { id: s.id },
              data: { quantity: 0 },
            });
          }

          console.log(`[AIPlayer] Created division for ${cs.countryId}`);
        } else {
          // No stock at all — recruit some system default units
          const systemUnits = await prisma.customUnit.findMany({
            where: { isSystemDefault: true },
          });

          const infantryUnit = systemUnits.find((u) => u.category === 'infantry');
          if (infantryUnit) {
            const cost100 = recruitCost(infantryUnit, 100);
            if (cs.gold >= cost100.gold && cs.manpower >= cost100.manpower) {
            await prisma.order.create({
              data: {
                gameId,
                playerId: cs.playerId || `ai-${cs.countryId}`,
                countryId: cs.countryId,
                turn: cs.turn,
                type: 'RECRUIT',
                recruitComposition: { [infantryUnit.id]: 100 },
                status: 'PENDING',
                isAIOrder: true,
              },
            });
            console.log(`[AIPlayer] ${cs.countryId} recruiting infantry (no stock)`);
            }
          }
        }
      }
    }
  }

  /**
   * Generate orders using divisions instead of raw troop counts.
   */
  private async generateDivisionOrders(
    gameId: string,
    cs: any,
    allStates: any[],
    turn: number,
    ruleAI: RuleBasedAI,
    allianceMap?: Map<string, Set<string>>
  ): Promise<any[]> {
    // Get AI's active divisions
    const divisions = await prisma.division.findMany({
      where: { gameId, countryId: cs.countryId, status: 'ACTIVE' },
    });

    if (divisions.length === 0) {
      // No divisions — recruit if possible
      const systemUnits = await prisma.customUnit.findMany({
        where: { isSystemDefault: true },
      });
      const infantryUnit = systemUnits.find((u) => u.category === 'infantry');
      if (infantryUnit) {
        const recruitQty = Math.min(5000, Math.max(1000, Math.floor(cs.manpower * 0.1)));
        const cost = recruitCost(infantryUnit, recruitQty);
        if (cs.gold >= cost.gold && cs.manpower >= cost.manpower) {
        return [{
          type: 'RECRUIT',
          recruitComposition: { [infantryUnit.id]: recruitQty },
          targetTerritoryId: null,
          fromTerritoryId: cs.territories[0] || cs.countryId,
          divisionIds: [],
          details: 'AI 招募步兵',
        }];
        }
      }
      return [];
    }

    // Use rule-based AI to decide action type
    const baseOrders = ruleAI.generateOrders(cs, allStates, turn, allianceMap).slice(0, 3);

    // Convert to division-based orders
    const orders: any[] = [];
    for (const base of baseOrders) {
      if (base.type === 'ATTACK' && base.targetTerritoryId) {
        // Send first active division
        orders.push({
          type: 'ATTACK',
          targetTerritoryId: base.targetTerritoryId,
          fromTerritoryId: cs.territories[0] || cs.countryId,
          divisionIds: divisions.slice(0, Math.max(1, Math.ceil(divisions.length * 0.6))).map(d => d.id),
          details: base.details || 'AI 進攻指令',
        });
      } else if (base.type === 'RECRUIT') {
        const systemUnits = await prisma.customUnit.findMany({
          where: { isSystemDefault: true },
        });
        const infantryUnit = systemUnits.find((u) => u.category === 'infantry');
        if (infantryUnit) {
          const recruitQty = Math.min(base.infantry || 5000, 100000);
          const cost = recruitCost(infantryUnit, recruitQty);
          if (cs.gold >= cost.gold && cs.manpower >= cost.manpower) {
          orders.push({
            type: 'RECRUIT',
            recruitComposition: { [infantryUnit.id]: recruitQty },
            targetTerritoryId: null,
            fromTerritoryId: cs.territories[0] || cs.countryId,
            divisionIds: [],
            details: 'AI 招募指令',
          });
          }
        }
      } else if (base.type === 'DEFEND') {
        orders.push({
          type: 'DEFEND',
          targetTerritoryId: null,
          fromTerritoryId: cs.territories[0] || cs.countryId,
          divisionIds: divisions.map((d) => d.id),
          details: base.details || 'AI 防禦指令',
        });
      }
    }

    return orders;
  }

  private async persistOrders(
    gameId: string,
    aiState: any,
    turn: number,
    orders: any[]
  ): Promise<void> {
    for (const order of orders) {
      await prisma.order.create({
        data: {
          gameId,
          playerId: aiState.playerId || `ai-${aiState.countryId}`,
          countryId: aiState.countryId,
          turn,
          type: order.type,
          fromTerritoryId: order.fromTerritoryId || null,
          targetTerritoryId: order.targetTerritoryId || null,
          infantry: order.infantry || null,
          artillery: order.artillery || null,
          cavalry: order.cavalry || null,
          divisionIds: order.divisionIds || [],
          recruitComposition: order.recruitComposition || null,
          details: order.details || 'AI 戰略指令',
          status: 'PENDING',
          isAIOrder: true,
        },
      });
    }
    console.log(`[AIPlayer] ${aiState.countryId}: ${orders.length} orders persisted (Turn ${turn})`);
  }

  private async getActiveProviders(): Promise<AIProvider[]> {
    const dbConfigs = await prisma.aIProviderConfig.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
    });

    const providers: AIProvider[] = dbConfigs
      .map((cfg) => ({
        id: cfg.id, name: cfg.name, type: cfg.type as any,
        apiKey: cfg.apiKeyEnc || process.env.OPENAI_API_KEY || '',
        endpoint: cfg.endpoint || undefined,
        model: cfg.model, priority: cfg.priority, isEnabled: cfg.isEnabled,
        timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries,
      }))
      .filter((p) => Boolean(p.apiKey));

    if (providers.length === 0 && process.env.OPENAI_API_KEY) {
      providers.push({
        id: 'env-openai', name: 'OpenAI (env)', type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        priority: 1, isEnabled: true, timeoutMs: 30000, maxRetries: 2,
      });
    }

    return providers;
  }
}
