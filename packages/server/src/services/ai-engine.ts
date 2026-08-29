import type { AIProvider, TurnResolution, Order, CountryState } from '@wwi/shared';

interface AIEngineConfig {
  providers: AIProvider[];
  enableDeterministicFallback: boolean;
  maxTotalTimeoutMs: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are the AI resolution engine for a WWI strategy game.
Given the current world state and all player orders for this turn, you must:
1. Analyze all military movements and conflicts
2. Determine battle outcomes based on force ratios, terrain, and morale
3. Generate a narrative battle report in Traditional Chinese (繁體中文) in the style of a wartime dispatch
4. Return results as structured JSON

Your response MUST be valid JSON with this exact structure:
{
  "battles": [
    {
      "territoryId": "string",
      "attackerCountryId": "string",
      "defenderCountryId": "string",
      "winnerCountryId": "string",
      "attackerCasualties": { "infantry": 0, "artillery": 0, "cavalry": 0 },
      "defenderCasualties": { "infantry": 0, "artillery": 0, "cavalry": 0 },
      "territoryCaptured": false,
      "narrative": "string in Traditional Chinese"
    }
  ],
  "events": [
    { "type": "BATTLE", "title": "string", "description": "string in Traditional Chinese", "countryIdsInvolved": ["string"] }
  ],
  "narrativeSummary": "Overall turn summary narrative in Traditional Chinese",
  "stateUpdates": [
    {
      "countryId": "string",
      "infantryChange": 0,
      "artilleryChange": 0,
      "cavalryChange": 0,
      "moraleChange": 0,
      "goldChange": 0,
      "manpowerChange": 0,
      "addTerritories": ["string"],
      "removeTerritories": ["string"]
    }
  ]
}`;

export class AIEngine {
  private config: AIEngineConfig;

  constructor(config: AIEngineConfig) {
    this.config = config;
  }

  async resolveTurn(
    turn: number,
    worldState: Record<string, any>,
    orders: any[]
  ): Promise<Partial<TurnResolution>> {
    const enabledProviders = this.config.providers
      .filter((p) => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    let lastError = '';

    for (const provider of enabledProviders) {
      const result = await this.tryProvider(provider, turn, worldState, orders);
      if (result.success) {
        return {
          ...result.data,
          resolvedByAIProvider: provider.name,
        } as Partial<TurnResolution>;
      }
      lastError = result.error || 'Unknown error';
      console.warn(`[AI Engine] Provider ${provider.name} failed: ${lastError}, trying next...`);
    }

    // Deterministic fallback
    if (this.config.enableDeterministicFallback) {
      console.log('[AI Engine] All AI providers failed, using deterministic fallback');
      return this.deterministicResolve(turn, worldState, orders);
    }

    throw new Error(`All AI providers failed. Last error: ${lastError}`);
  }

  /**
   * Generate 1-2 strategic orders for an AI country using an LLM.
   */
  async generateAIOrders(
    turn: number,
    aiCountryState: any,
    allCountryStates: any[]
  ): Promise<Array<{
    type: string;
    targetTerritoryId?: string;
    fromTerritoryId?: string;
    infantry?: number;
    artillery?: number;
    cavalry?: number;
    details?: string;
  }>> {
    const enabledProviders = this.config.providers
      .filter((p) => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    if (enabledProviders.length === 0) {
      throw new Error('No enabled AI providers available');
    }

    const provider = enabledProviders[0];
    const endpoint = provider.endpoint || 'https://api.openai.com/v1';
    const apiKey = this.getApiKey(provider);

    if (!apiKey) {
      throw new Error(`No API key configured for ${provider.name}`);
    }

    const systemPrompt = `You are a military strategist AI for country "${aiCountryState.countryId}" in a WWI strategy game.
Based on current world state and country status, generate 1 to 2 strategic orders for this turn.
Order types available: "ATTACK", "DEFEND", "RECRUIT", "FORTIFY", "MOVE", "DIPLOMACY".
All details text MUST be in Traditional Chinese (繁體中文).

Respond ONLY with valid JSON in this format:
{
  "orders": [
    {
      "type": "ATTACK",
      "targetTerritoryId": "target_id",
      "fromTerritoryId": "from_id",
      "infantry": 50000,
      "artillery": 100,
      "cavalry": 20,
      "details": "進攻敘述"
    }
  ]
}`;

    const userMsg = JSON.stringify({
      turn,
      country: {
        countryId: aiCountryState.countryId,
        infantry: aiCountryState.infantry,
        artillery: aiCountryState.artillery,
        cavalry: aiCountryState.cavalry,
        morale: aiCountryState.morale,
        gold: aiCountryState.gold,
        industry: aiCountryState.industry,
        manpower: aiCountryState.manpower,
        territories: aiCountryState.territories,
      },
      worldTerritories: allCountryStates.map((cs) => ({
        countryId: cs.countryId,
        territories: cs.territories,
        infantry: cs.infantry,
      })),
    });

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AI Order API returned ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response for orders');

    const parsed = JSON.parse(content);
    return parsed.orders || [];
  }

  private async tryProvider(
    provider: AIProvider,
    turn: number,
    worldState: Record<string, any>,
    orders: any[]
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const maxRetries = provider.maxRetries || 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.callWithTimeout(
          () => this.callAPI(provider, turn, worldState, orders),
          provider.timeoutMs || 30000
        );
        return { success: true, data: result };
      } catch (error: any) {
        const errMsg = error.message || String(error);
        if (attempt < maxRetries - 1) {
          console.warn(`[AI Engine] ${provider.name} attempt ${attempt + 1} failed: ${errMsg}, retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        } else {
          return { success: false, error: errMsg };
        }
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  private async callWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);
  }

  private async callAPI(
    provider: AIProvider,
    turn: number,
    worldState: Record<string, any>,
    orders: any[]
  ): Promise<any> {
    const userMessage = JSON.stringify({
      turn,
      worldState: Object.values(worldState).map((s: any) => ({
        countryId: s.countryId,
        name: s.name || s.countryId,
        side: s.side || 'neutral',
        infantry: s.infantry ?? s.manpower ?? 0,
        artillery: s.artillery ?? 0,
        cavalry: s.cavalry ?? 0,
        morale: s.morale ?? 50,
        gold: s.gold ?? 0,
        industry: s.industry ?? s.industrialPoints ?? 0,
        manpower: s.manpower ?? 0,
        stability: s.stability ?? 50,
        territories: s.territories || s.territoryIds || [],
        isAI: Boolean(s.isAIControlled || s.isAI),
      })),
      orders: orders.map((o: any) => ({
        countryId: o.countryId,
        type: o.type,
        from: o.fromTerritoryId,
        target: o.targetTerritoryId,
        units: {
          infantry: o.infantry || o.units?.infantry || 0,
          artillery: o.artillery || o.units?.artillery || 0,
          cavalry: o.cavalry || o.units?.cavalry || 0,
        },
        details: o.details,
      })),
    });

    if (provider.type === 'deterministic') {
      return this.deterministicResolve(turn, worldState, orders);
    }

    const endpoint = provider.endpoint || 'https://api.openai.com/v1';
    const apiKey = this.getApiKey(provider);

    if (!apiKey) {
      throw new Error(`No API key configured for ${provider.name}`);
    }

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API returned ${res.status}: ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    return JSON.parse(content);
  }

  private getApiKey(provider: AIProvider): string {
    if (provider.apiKey) return provider.apiKey;
    if (provider.type === 'openai') {
      return process.env.OPENAI_API_KEY || '';
    }
    return process.env[`AI_KEY_${provider.id}`] || process.env.OPENAI_API_KEY || '';
  }

  async testConnection(provider: AIProvider): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.callWithTimeout(
        () => this.callAPI(provider, 0, {}, []),
        10000
      );
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Deterministic fallback - simple rules-based resolution
  private deterministicResolve(
    turn: number,
    worldState: Record<string, any>,
    orders: any[]
  ): Partial<TurnResolution> {
    const battles: any[] = [];
    const events: any[] = [];

    for (const order of orders) {
      if (order.type !== 'ATTACK') continue;

      const attacker = worldState[order.countryId];
      if (!attacker) continue;

      let defenderId: string | undefined;
      for (const state of Object.values(worldState)) {
        const territories = state.territories || state.territoryIds || [];
        if (territories.includes(order.targetTerritoryId || '')) {
          defenderId = state.countryId;
          break;
        }
      }

      if (!defenderId) {
        battles.push({
          territoryId: order.targetTerritoryId,
          attackerCountryId: order.countryId,
          defenderCountryId: 'neutral',
          winnerCountryId: order.countryId,
          attackerCasualties: { infantry: 0, artillery: 0, cavalry: 0 },
          defenderCasualties: { infantry: 0, artillery: 0, cavalry: 0 },
          territoryCaptured: true,
          narrative: `未遇抵抗,順利推進至 ${order.targetTerritoryId}。`,
        });
        continue;
      }

      const defender = worldState[defenderId];
      const attackerInf = order.infantry || order.units?.infantry || 0;
      const attackerArt = order.artillery || order.units?.artillery || 0;
      const attackerCav = order.cavalry || order.units?.cavalry || 0;

      const attackerStrength = attackerInf * 1.0 + attackerArt * 3.0 + attackerCav * 2.0;
      const defenderStrength = (defender.infantry || defender.manpower || 100000) * 0.2;

      const attackerWins = attackerStrength > defenderStrength * 0.8;

      const attackerLosses = Math.floor(attackerInf * (attackerWins ? 0.15 : 0.4));
      const defenderLosses = Math.floor((defender.infantry || 100000) * (attackerWins ? 0.3 : 0.1));

      battles.push({
        territoryId: order.targetTerritoryId,
        attackerCountryId: order.countryId,
        defenderCountryId: defenderId,
        winnerCountryId: attackerWins ? order.countryId : defenderId,
        attackerCasualties: { infantry: attackerLosses, artillery: 0, cavalry: 0 },
        defenderCasualties: { infantry: defenderLosses, artillery: 0, cavalry: 0 },
        territoryCaptured: attackerWins,
        narrative: attackerWins
          ? `${attacker.name || order.countryId} 軍隊突破防線,攻佔 ${order.targetTerritoryId}。`
          : `${defender.name || defenderId} 守軍成功擊退進攻。`,
      });

      events.push({
        type: 'BATTLE',
        title: `${order.targetTerritoryId} 戰況`,
        description: attackerWins
          ? `${attacker.name || order.countryId} 攻佔 ${order.targetTerritoryId}`
          : `${defender.name || defenderId} 守住 ${order.targetTerritoryId}`,
        countryIdsInvolved: [order.countryId, defenderId],
      });
    }

    return {
      battleResults: battles,
      events,
      narrativeSummary: `第 ${turn} 回合確定性推演完成。共爆發 ${battles.length} 場戰鬥。`,
      resolvedByAIProvider: 'deterministic-fallback',
      executionTimeMs: 0,
    };
  }
}
