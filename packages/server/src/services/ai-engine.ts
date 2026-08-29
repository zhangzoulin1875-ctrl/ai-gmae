import type { FallbackChain, AIProvider, TurnResolution, Order, CountryState } from '@wwi/shared';

interface AIEngineConfig {
  providers: AIProvider[];
  enableDeterministicFallback: boolean;
  maxTotalTimeoutMs: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are the AI resolution engine for a WWI strategy game.
Given the current world state and all player orders for this turn, you must:
1. Analyze all military movements and conflicts
2. Determine battle outcomes based on force ratios, terrain, and morale
3. Generate a narrative battle report in the style of a wartime dispatch
4. Return results as structured JSON

Your response MUST be valid JSON with this structure:
{
  "battles": [{ "territoryId": "", "attackerCountryId": "", "defenderCountryId": "", "winnerCountryId": "", "attackerCasualties": {"infantry":0,"artillery":0,"cavalry":0}, "defenderCasualties": {"infantry":0,"artillery":0,"cavalry":0}, "territoryCaptured": false, "narrative": "" }],
  "events": [{ "type": "BATTLE", "title": "", "description": "", "countryIdsInvolved": [] }],
  "narrativeSummary": "Overall turn summary narrative",
  "stateUpdates": [{ "countryId": "", "field": "", "change": 0 }]
}`;

export class AIEngine {
  private config: AIEngineConfig;

  constructor(config: AIEngineConfig) {
    this.config = config;
  }

  async resolveTurn(
    turn: number,
    worldState: Record<string, CountryState>,
    orders: Order[]
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

  private async tryProvider(
    provider: AIProvider,
    turn: number,
    worldState: Record<string, CountryState>,
    orders: Order[]
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
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); // exponential backoff
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
    worldState: Record<string, CountryState>,
    orders: Order[]
  ): Promise<any> {
    const userMessage = JSON.stringify({
      turn,
      worldState: Object.values(worldState).map((s) => ({
        countryId: s.countryId,
        name: s.name,
        side: s.side,
        infantry: s.manpower,
        gold: s.gold,
        industry: s.industrialPoints,
        stability: s.stability,
        territories: s.territoryIds,
        isAI: s.isAI,
      })),
      orders: orders.map((o) => ({
        countryId: o.countryId,
        type: o.type,
        from: o.fromTerritoryId,
        target: o.targetTerritoryId,
        units: o.units,
        details: o.details,
      })),
    });

    if (provider.type === 'deterministic') {
      return this.deterministicResolve(turn, worldState, orders);
    }

    // OpenAI-compatible API (also works for custom)
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
    if (provider.type === 'openai') {
      return provider.apiKey || process.env.OPENAI_API_KEY || '';
    }
    // Custom providers
    return provider.apiKey || process.env[`AI_KEY_${provider.id}`] || '';
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
    worldState: Record<string, CountryState>,
    orders: Order[]
  ): Partial<TurnResolution> {
    const battles: any[] = [];
    const events: any[] = [];

    // Process attack orders
    for (const order of orders) {
      if (order.type !== 'ATTACK') continue;

      const attacker = worldState[order.countryId];
      if (!attacker) continue;

      // Find the defending country at the target territory
      let defenderId: string | undefined;
      for (const state of Object.values(worldState)) {
        if (state.territoryIds.includes(order.targetTerritoryId || '')) {
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
          narrative: `Unopposed advance into territory.`,
        });
        continue;
      }

      const defender = worldState[defenderId];
      const attackerStrength = (order.units?.infantry || 0) * 1.0 +
        (order.units?.artillery || 0) * 1.5 + (order.units?.cavalry || 0) * 0.8;
      const defenderStrength = defender.manpower * 0.5; // simplified

      const attackerWins = attackerStrength > defenderStrength * 0.8;

      const attackerLosses = Math.floor(
        (attackerStrength * (attackerWins ? 0.2 : 0.5))
      );
      const defenderLosses = Math.floor(
        (defenderStrength * (attackerWins ? 0.5 : 0.2))
      );

      battles.push({
        territoryId: order.targetTerritoryId,
        attackerCountryId: order.countryId,
        defenderCountryId: defenderId,
        winnerCountryId: attackerWins ? order.countryId : defenderId,
        attackerCasualties: { infantry: attackerLosses, artillery: 0, cavalry: 0 },
        defenderCasualties: { infantry: defenderLosses, artillery: 0, cavalry: 0 },
        territoryCaptured: attackerWins,
        narrative: attackerWins
          ? `${attacker.name} forces broke through at ${order.targetTerritoryId}.`
          : `${defender.name} held the line at ${order.targetTerritoryId}.`,
      });

      events.push({
        type: 'BATTLE',
        title: `Battle at ${order.targetTerritoryId}`,
        description: attackerWins
          ? `${attacker.name} captured ${order.targetTerritoryId} from ${defender.name}.`
          : `${defender.name} repelled the attack by ${attacker.name}.`,
        countryIdsInvolved: [order.countryId, defenderId],
      });
    }

    return {
      battleResults: battles,
      events,
      narrativeSummary: `Turn ${turn} resolved via deterministic fallback. ${battles.length} battles fought.`,
      resolvedByAIProvider: 'deterministic-fallback',
      executionTimeMs: 0,
    };
  }
}
