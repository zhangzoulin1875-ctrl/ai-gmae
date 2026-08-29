/**
 * Unit Designer Service — uses LLM to design custom military units based on prompts.
 * Enforced by hard rules (UnitDesignRule) to prevent anachronistic/impossible units.
 * All LLM calls go through the API queue (1 concurrent max).
 */

import { prisma } from '../lib/prisma.js';
import { apiQueue } from './api-queue.js';
import type { AIProvider } from '@wwi/shared';

const DEFAULT_RULES = {
  era: '1914',
  maxPerCategory: 5,
  maxAttack: 100,
  maxDefense: 100,
  maxSpeed: 50,
  maxRange: 10,
  minCostGold: 10,
  minCostManpower: 1000,
  minCostIndustry: 1,
  forbiddenTechs: 'nuclear,atomic,nuke,missile,ballistic,jet,satellite,computer,drone,laser,stealth,cyber,radar,sonar,submarine-launched,ICBM,smart bomb,GPS',
  allowedEra: 'bolt-action rifle,machine gun,artillery cannon,cavalry horse,steam ship,dreadnought,zeppelin,early tank,biplane,trench,barbed wire,gas,flamethrower',
};

const CATEGORIES = ['infantry', 'cavalry', 'artillery', 'fleet', 'armored'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_ZH: Record<string, string> = {
  infantry: '步兵',
  cavalry: '騎兵',
  artillery: '砲兵',
  fleet: '艦隊',
  armored: '裝甲',
};

export class UnitDesignerService {
  /**
   * Design a new unit via LLM, constrained by hard rules.
   */
  async designUnit(params: {
    prompt: string;
    category: string;
    gameId?: string;
    userId: string;
    username: string;
    countryId?: string;
  }): Promise<{
    success: boolean;
    unit?: any;
    error?: string;
  }> {
    const { prompt, category, gameId, userId, username, countryId } = params;

    if (!CATEGORIES.includes(category as Category)) {
      return { success: false, error: `無效的兵種類別，允許: ${CATEGORIES.join(', ')}` };
    }

    // Load rules
    let rules = await prisma.unitDesignRule.findFirst();
    if (!rules) {
      rules = await prisma.unitDesignRule.create({ data: {} as any });
    }
    const r = { ...DEFAULT_RULES, ...rules } as any;

    // Check category count limit — PER PLAYER, not global
    // (each player designs their own roster; one player's units don't block another's)
    const existingCount = await prisma.customUnit.count({
      where: { category, gameId: gameId || null, designedByUserId: userId },
    });
    if (existingCount >= r.maxPerCategory) {
      return { success: false, error: `你的${CATEGORY_ZH[category]}已達上限（${r.maxPerCategory} 種）` };
    }

    // Validate prompt against forbidden technologies
    const forbiddenList = r.forbiddenTechs.split(',').map((s: string) => s.trim().toLowerCase());
    const promptLower = prompt.toLowerCase();
    for (const tech of forbiddenList) {
      if (promptLower.includes(tech)) {
        return { success: false, error: `提示詞包含禁用技術「${tech}」——${r.era}年代不存在此技術` };
      }
    }

    // Load AI providers
    const providers = await this.getProviders();
    if (providers.length === 0) {
      return { success: false, error: '未設定 AI 供應商，無法生成兵種設計' };
    }

    const provider = providers[0];
    const endpoint = provider.endpoint || 'https://api.openai.com/v1';
    const apiKey = provider.apiKey;

    // Build system prompt with hard rules
    const systemPrompt = `You are a military historian and game designer for a WWI-era (${r.era}) strategy game.
Design a single military unit based on the user's prompt.

STRICT RULES (violations will be rejected):
1. Era: ${r.era} — World War I period ONLY
2. Forbidden technologies: ${r.forbiddenTechs}
3. Allowed technologies: ${r.allowedEra}
4. Unit category: ${CATEGORY_ZH[category]} (${category})

STAT CAPS (must not exceed):
- attack: max ${r.maxAttack}
- defense: max ${r.maxDefense}
- speed: max ${r.maxSpeed}
- range: max ${r.maxRange}
- costGold: min ${r.minCostGold}
- costManpower: min ${r.minCostManpower}
- costIndustry: min ${r.minCostIndustry}

All names and descriptions MUST be in Traditional Chinese (繁體中文).

Respond ONLY with valid JSON:
{
  "nameZh": "中文名稱",
  "nameEn": "English Name",
  "description": "繁體中文描述（1-2句話）",
  "attack": 25,
  "defense": 30,
  "speed": 8,
  "range": 1,
  "costGold": 80,
  "costManpower": 15000,
  "costIndustry": 8
}`;

    const userMsg = `設計一個${CATEGORY_ZH[category]}單位。提示詞: ${prompt}`;

    try {
      // Route through API queue (1 concurrent max)
      const result = await apiQueue.enqueue(async () => {
        const res = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model,
            temperature: 0.7,
            max_tokens: 1000,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMsg },
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
        if (!content) throw new Error('AI 回應為空');
        return JSON.parse(content);
      });

      // Validate and clamp stats against hard rules
      const unit = this.clampStats(result, r);

      // Post-validation: check forbidden techs in generated content
      const fullText = `${unit.nameZh} ${unit.nameEn || ''} ${unit.description || ''}`.toLowerCase();
      for (const tech of forbiddenList) {
        if (fullText.includes(tech)) {
          return { success: false, error: `AI 生成的兵種包含禁用技術「${tech}」，設計被拒` };
        }
      }

      // Save to DB — with designer attribution
      const saved = await prisma.customUnit.create({
        data: {
          gameId: gameId || null,
          category,
          nameZh: unit.nameZh,
          nameEn: unit.nameEn || null,
          description: unit.description || null,
          attack: unit.attack,
          defense: unit.defense,
          speed: unit.speed,
          range_: unit.range,
          costGold: unit.costGold,
          costManpower: unit.costManpower,
          costIndustry: unit.costIndustry,
          prompt,
          isApproved: true,
          designedByUserId: userId,
          designedByUsername: username,
          designedByCountryId: countryId || null,
        },
      });

      return { success: true, unit: saved };
    } catch (err: any) {
      return { success: false, error: `兵種設計失敗: ${err.message}` };
    }
  }

  /**
   * Clamp all stats within hard rule limits.
   */
  private clampStats(raw: any, r: any): any {
    return {
      nameZh: String(raw.nameZh || '未命名兵種').slice(0, 50),
      nameEn: raw.nameEn ? String(raw.nameEn).slice(0, 50) : null,
      description: raw.description ? String(raw.description).slice(0, 200) : null,
      attack: Math.min(r.maxAttack, Math.max(1, Number(raw.attack) || 10)),
      defense: Math.min(r.maxDefense, Math.max(1, Number(raw.defense) || 10)),
      speed: Math.min(r.maxSpeed, Math.max(1, Number(raw.speed) || 5)),
      range: Math.min(r.maxRange, Math.max(1, Number(raw.range) || 1)),
      costGold: Math.max(r.minCostGold, Number(raw.costGold) || r.minCostGold),
      costManpower: Math.max(r.minCostManpower, Number(raw.costManpower) || r.minCostManpower),
      costIndustry: Math.max(r.minCostIndustry, Number(raw.costIndustry) || r.minCostIndustry),
    };
  }

  private async getProviders(): Promise<AIProvider[]> {
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

  // === CRUD helpers ===

  async listUnits(gameId?: string): Promise<any[]> {
    return prisma.customUnit.findMany({
      where: gameId ? { OR: [{ gameId }, { gameId: null }] } : {},
      orderBy: { category: 'asc' },
    });
  }

  async deleteUnit(id: string): Promise<void> {
    await prisma.customUnit.delete({ where: { id } });
  }

  async getRules(): Promise<any> {
    let rules = await prisma.unitDesignRule.findFirst();
    if (!rules) {
      rules = await prisma.unitDesignRule.create({ data: {} as any });
    }
    return rules;
  }

  async updateRules(data: any): Promise<any> {
    let rules = await prisma.unitDesignRule.findFirst();
    if (!rules) {
      rules = await prisma.unitDesignRule.create({ data: {} as any });
    }
    return prisma.unitDesignRule.update({
      where: { id: rules.id },
      data: {
        era: data.era ?? undefined,
        maxPerCategory: data.maxPerCategory ?? undefined,
        maxAttack: data.maxAttack ?? undefined,
        maxDefense: data.maxDefense ?? undefined,
        maxSpeed: data.maxSpeed ?? undefined,
        maxRange: data.maxRange ?? undefined,
        minCostGold: data.minCostGold ?? undefined,
        minCostManpower: data.minCostManpower ?? undefined,
        minCostIndustry: data.minCostIndustry ?? undefined,
        forbiddenTechs: data.forbiddenTechs ?? undefined,
        allowedEra: data.allowedEra ?? undefined,
      },
    });
  }

  getQueueStatus() {
    return { size: apiQueue.size, processed: apiQueue.processed, isBusy: apiQueue.isBusy };
  }
}
