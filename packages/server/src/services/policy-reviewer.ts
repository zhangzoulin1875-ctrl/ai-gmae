import { prisma } from '../lib/prisma.js';
import { apiQueue } from './api-queue.js';
import type { AIProvider } from '@wwi/shared';

export async function reviewPendingPolicies(gameId: string, turn: number): Promise<void> {
  const pendingPolicies = await prisma.policySubmission.findMany({
    where: { gameId, turn, status: 'PENDING' },
  });

  if (pendingPolicies.length === 0) return;

  const providers = await getActiveProviders();

  // Find next turn country state (turn + 1)
  const nextTurn = turn + 1;

  for (const policy of pendingPolicies) {
    try {
      let verdict = 'PARTIAL';
      let reasoning = '';
      let effects = {
        goldChange: 0,
        industryChange: 0,
        manpowerChange: 0,
        moraleChange: 0,
        stabilityChange: 0,
      };

      if (providers.length > 0) {
        const provider = providers[0];
        const endpoint = provider.endpoint || 'https://api.openai.com/v1';
        const apiKey = provider.apiKey;

        const systemPrompt = `You are a government advisor reviewing a policy proposal for a WWI-era nation.
Evaluate the policy submission and decide whether to approve, partially approve, or reject it based on feasibility and historical context.
Provide constructive feedback and realistic effects on national resources.

STRICT CLAMPS (do not exceed):
- goldChange: -200 to +200
- industryChange: -10 to +10
- manpowerChange: -50000 to +50000
- moraleChange: -10 to +10
- stabilityChange: -10 to +10

All text in reasoning MUST be in Traditional Chinese (繁體中文).

Respond ONLY with valid JSON:
{
  "verdict": "approved",
  "reasoning": "繁體中文審核意見",
  "effects": {
    "goldChange": 50,
    "industryChange": 2,
    "manpowerChange": 10000,
    "moraleChange": 3,
    "stabilityChange": 2
  }
}
Note: verdict must be "approved", "partial", or "rejected".`;

        const userMsg = `國家: ${policy.countryId}, 政策標題: ${policy.title}\n內容:\n${policy.content}`;

        const aiResult = await apiQueue.enqueue(async () => {
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
            const errText = await res.text();
            throw new Error(`Policy review API returned ${res.status}: ${errText}`);
          }

          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (!content) throw new Error('AI 回應為空');
          return JSON.parse(content);
        });

        const rawVerdict = String(aiResult.verdict || 'partial').toLowerCase();
        if (rawVerdict.includes('approve')) verdict = 'APPROVED';
        else if (rawVerdict.includes('reject')) verdict = 'REJECTED';
        else verdict = 'PARTIAL';

        reasoning = aiResult.reasoning || '政策審核完成。';
        const rawFx = aiResult.effects || {};

        effects = {
          goldChange: clamp(Number(rawFx.goldChange) || 0, -200, 200),
          industryChange: clamp(Number(rawFx.industryChange) || 0, -10, 10),
          manpowerChange: clamp(Number(rawFx.manpowerChange) || 0, -50000, 50000),
          moraleChange: clamp(Number(rawFx.moraleChange) || 0, -10, 10),
          stabilityChange: clamp(Number(rawFx.stabilityChange) || 0, -10, 10),
        };
      } else {
        // Fallback when no AI provider
        verdict = 'PARTIAL';
        reasoning = '未設定 AI，套用預設小幅獎勵';
        effects = {
          goldChange: 10,
          industryChange: 0,
          manpowerChange: 0,
          moraleChange: 0,
          stabilityChange: 1,
        };
      }

      // Apply effects to next turn country state (turn + 1)
      const nextCs = await prisma.countryState.findUnique({
        where: {
          gameId_countryId_turn: {
            gameId,
            countryId: policy.countryId,
            turn: nextTurn,
          },
        },
      });

      if (nextCs) {
        await prisma.countryState.update({
          where: { id: nextCs.id },
          data: {
            gold: Math.max(0, nextCs.gold + effects.goldChange),
            industry: Math.max(0, nextCs.industry + effects.industryChange),
            manpower: Math.max(0, nextCs.manpower + effects.manpowerChange),
            morale: Math.min(100, Math.max(0, nextCs.morale + effects.moraleChange)),
            stability: Math.min(100, Math.max(0, nextCs.stability + effects.stabilityChange)),
          },
        });
      }

      // Update PolicySubmission row
      await prisma.policySubmission.update({
        where: { id: policy.id },
        data: {
          status: verdict,
          aiVerdict: reasoning,
          effects,
        },
      });
    } catch (err: any) {
      console.error(`[PolicyReviewer] Error processing policy ${policy.id}:`, err.message);
      // Fallback update on failure so policy doesn't stay PENDING
      try {
        await prisma.policySubmission.update({
          where: { id: policy.id },
          data: {
            status: 'PARTIAL',
            aiVerdict: `政策審核時發生錯誤: ${err.message}`,
            effects: { goldChange: 0, industryChange: 0, manpowerChange: 0, moraleChange: 0, stabilityChange: 0 },
          },
        });
      } catch (_) {}
    }
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

async function getActiveProviders(): Promise<AIProvider[]> {
  const dbConfigs = await prisma.aIProviderConfig.findMany({
    where: { isEnabled: true },
    orderBy: { priority: 'asc' },
  });

  const providers: AIProvider[] = dbConfigs
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

  if (providers.length === 0 && process.env.OPENAI_API_KEY) {
    providers.push({
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

  return providers;
}
