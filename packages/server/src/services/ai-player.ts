import { prisma } from '../lib/prisma.js';
import { AIEngine } from './ai-engine.js';
import { RuleBasedAI } from './rule-based-ai.js';
import { WWI_COUNTRIES } from '@wwi/shared';
import type { AIProvider } from '@wwi/shared';

export class AIPlayerService {
  /**
   * Generate strategic orders for all AI-controlled countries in a game and turn.
   * Each AI country uses either LLM or rule-based engine, controlled by Player.aiPersonality:
   *   'formula' -> RuleBasedAI (HOI4-style, no API cost)
   *   'llm'     -> AIEngine (LLM API call)
   *   null/other -> defaults to 'formula'
   */
  async generateOrdersForGame(gameId: string, turn: number): Promise<void> {
    const allCountryStates = await prisma.countryState.findMany({ where: { gameId, turn } });
    if (allCountryStates.length === 0) return;

    const aiCountryStates = allCountryStates.filter((cs) => cs.isAIControlled);
    if (aiCountryStates.length === 0) return;

    // Load AI players to check their mode (aiPersonality field)
    const aiPlayers = await prisma.player.findMany({
      where: { gameId, isAI: true },
    });
    const playerModeMap = new Map<string, string>();
    for (const p of aiPlayers) {
      playerModeMap.set(p.countryId, p.aiPersonality || 'formula');
    }

    // Load AI provider configs for LLM mode
    const dbConfigs = await prisma.aIProviderConfig.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
    });

    const activeProviders: AIProvider[] = dbConfigs
      .map((cfg) => ({
        id: cfg.id, name: cfg.name, type: cfg.type as any,
        apiKey: cfg.apiKeyEnc || process.env.OPENAI_API_KEY || '',
        endpoint: cfg.endpoint || undefined,
        model: cfg.model, priority: cfg.priority, isEnabled: cfg.isEnabled,
        timeoutMs: cfg.timeoutMs, maxRetries: cfg.maxRetries,
      }))
      .filter((p) => Boolean(p.apiKey));

    if (activeProviders.length === 0 && process.env.OPENAI_API_KEY) {
      activeProviders.push({
        id: 'env-openai', name: 'OpenAI (env)', type: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        endpoint: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        priority: 1, isEnabled: true, timeoutMs: 30000, maxRetries: 2,
      });
    }

    const aiEngine = activeProviders.length > 0
      ? new AIEngine({ providers: activeProviders, enableDeterministicFallback: false, maxTotalTimeoutMs: 30000 })
      : null;

    const ruleAI = new RuleBasedAI();
    let llmCount = 0, formulaCount = 0;

    for (const aiState of aiCountryStates) {
      // Skip if already has pending orders
      const existing = await prisma.order.findMany({
        where: { gameId, countryId: aiState.countryId, turn, status: 'PENDING' },
      });
      if (existing.length > 0) continue;

      const mode = playerModeMap.get(aiState.countryId) || 'formula';
      let generatedOrders: any[] = [];

      if (mode === 'llm' && aiEngine) {
        try {
          generatedOrders = await aiEngine.generateAIOrders(turn, aiState as any, allCountryStates as any);
          llmCount++;
        } catch (err: any) {
          console.warn(`[AIPlayer] LLM failed for ${aiState.countryId}: ${err.message}, using formula`);
          generatedOrders = ruleAI.generateOrders(aiState, allCountryStates, turn);
          formulaCount++;
        }
      } else {
        // Default: rule-based formula engine
        generatedOrders = ruleAI.generateOrders(aiState, allCountryStates, turn);
        formulaCount++;
      }

      // Max 3 orders per turn
      const finalOrders = generatedOrders.slice(0, 3);

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

      console.log(`[AIPlayer] ${aiState.countryId} (${mode}): ${finalOrders.length} orders (Turn ${turn})`);
    }

    console.log(`[AIPlayer] Turn ${turn} complete: ${formulaCount} formula, ${llmCount} LLM`);
  }
}
