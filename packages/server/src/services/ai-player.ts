import { prisma } from '../lib/prisma.js';
import { AIEngine } from './ai-engine.js';
import { RuleBasedAI } from './rule-based-ai.js';
import { WWI_COUNTRIES } from '@wwi/shared';
import type { AIProvider } from '@wwi/shared';

// Max LLM API calls per turn (configurable via env). Default: 2
// 1 = batch AI orders only (no LLM narrative), 2 = batch orders + narrative
const MAX_LLM_CALLS_PER_TURN = parseInt(process.env.MAX_LLM_CALLS_PER_TURN || '2', 10);

export class AIPlayerService {
  /**
   * Generate strategic orders for all AI-controlled countries in a game and turn.
   *
   * Rate-limit strategy:
   * - LLM countries are BATCHED into a single API call (1 call for all)
   * - Formula countries use zero-cost rule-based engine
   * - Total LLM calls per turn: max 1 (batch orders) + 1 (narrative) = 2
   * - Falls back to formula for any country where LLM didn't return orders
   */
  async generateOrdersForGame(gameId: string, turn: number): Promise<void> {
    const allCountryStates = await prisma.countryState.findMany({ where: { gameId, turn } });
    if (allCountryStates.length === 0) return;

    const aiCountryStates = allCountryStates.filter((cs) => cs.isAIControlled);
    if (aiCountryStates.length === 0) return;

    // Load AI players to check their mode
    const aiPlayers = await prisma.player.findMany({ where: { gameId, isAI: true } });
    const playerModeMap = new Map<string, string>();
    for (const p of aiPlayers) {
      playerModeMap.set(p.countryId, p.aiPersonality || 'formula');
    }

    // Split into formula vs LLM groups
    const formulaStates: typeof aiCountryStates = [];
    const llmStates: typeof aiCountryStates = [];

    for (const cs of aiCountryStates) {
      // Skip if already has pending orders
      const existing = await prisma.order.findMany({
        where: { gameId, countryId: cs.countryId, turn, status: 'PENDING' },
      });
      if (existing.length > 0) continue;

      const mode = playerModeMap.get(cs.countryId) || 'formula';
      if (mode === 'llm') {
        llmStates.push(cs);
      } else {
        formulaStates.push(cs);
      }
    }

    console.log(`[AIPlayer] Turn ${turn}: ${formulaStates.length} formula, ${llmStates.length} LLM`);

    // 1. Process ALL formula countries first (zero cost, instant)
    const ruleAI = new RuleBasedAI();
    for (const cs of formulaStates) {
      const orders = ruleAI.generateOrders(cs, allCountryStates, turn).slice(0, 3);
      await this.persistOrders(gameId, cs, turn, orders);
    }

    // 2. Process LLM countries as a SINGLE batch call
    if (llmStates.length > 0) {
      let llmOrdersMap: Record<string, Array<any>> = {};

      // Check rate limit
      if (MAX_LLM_CALLS_PER_TURN >= 1) {
        // Load AI providers
        const providers = await this.getActiveProviders();
        if (providers.length > 0) {
          const aiEngine = new AIEngine({
            providers,
            enableDeterministicFallback: false,
            maxTotalTimeoutMs: 45000,
          });

          // Single batch call for ALL LLM countries
          llmOrdersMap = await aiEngine.generateBatchAIOrders(
            turn,
            llmStates.map((cs) => ({
              countryId: cs.countryId,
              infantry: cs.infantry,
              artillery: cs.artillery,
              cavalry: cs.cavalry,
              morale: cs.morale,
              gold: cs.gold,
              industry: cs.industry,
              manpower: cs.manpower,
              stability: cs.stability,
              territories: cs.territories as string[],
            })),
            allCountryStates
          );
        } else {
          console.warn('[AIPlayer] No LLM providers configured, using formula fallback for LLM-mode countries');
        }
      } else {
        console.log('[AIPlayer] LLM disabled (MAX_LLM_CALLS_PER_TURN=0), using formula for all');
      }

      // Use LLM orders if available, otherwise fall back to formula per-country
      for (const cs of llmStates) {
        let orders = llmOrdersMap[cs.countryId] || [];
        if (orders.length === 0) {
          // LLM didn't return orders for this country — use formula
          orders = ruleAI.generateOrders(cs, allCountryStates, turn).slice(0, 3);
        }
        await this.persistOrders(gameId, cs, turn, orders);
      }
    }

    console.log(`[AIPlayer] Turn ${turn} complete: ${formulaStates.length} formula + ${llmStates.length} LLM (batched into 1 call)`);
  }

  private async persistOrders(
    gameId: string,
    aiState: any,
    turn: number,
    orders: Array<{
      type: string;
      fromTerritoryId: string | null;
      targetTerritoryId: string | null;
      infantry: number | null;
      artillery: number | null;
      cavalry: number | null;
      details: string | null;
    }>
  ): Promise<void> {
    for (const order of orders) {
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
