/**
 * Shared LLM call helper with provider fallback chain.
 *
 * All AI services (turn resolution, policy review, unit design, AI orders)
 * use this to get automatic fallback to the next provider when the first
 * one errors out, instead of surfacing the error directly to the user.
 */

import { prisma } from '../lib/prisma.js';
import { apiQueue } from './api-queue.js';
import type { AIProvider } from '@wwi/shared';

export interface LLMCallResult {
  success: boolean;
  data?: any;
  error?: string;
  providerName?: string;
}

/**
 * Load all enabled providers from DB + env, sorted by priority.
 */
export async function getEnabledProviders(): Promise<AIProvider[]> {
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

  if (process.env.GOOGLE_AI_API_KEY) {
    if (!providers.some((p) => p.type === 'google')) {
      providers.push({
        id: 'env-google',
        name: 'Google AI (env)',
        type: 'google',
        apiKey: process.env.GOOGLE_AI_API_KEY,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        model: process.env.GOOGLE_AI_MODEL || 'gemini-1.5-flash',
        priority: providers.length + 1,
        isEnabled: true,
        timeoutMs: 30000,
        maxRetries: 2,
      });
    }
  }

  return providers;
}

/**
 * Call an LLM API with automatic fallback across all enabled providers.
 *
 * The `buildRequest` function receives a provider and returns the fetch
 * init (URL, headers, body) for that specific provider.
 *
 * Goes through the API queue (1 concurrent max) for each attempt.
 */
export async function callLLMWithFallback(
  buildRequest: (provider: AIProvider) => {
    url: string;
    headers: Record<string, string>;
    body: any;
  },
  opts?: {
    timeoutMs?: number;
    maxRetries?: number;
  }
): Promise<LLMCallResult> {
  const providers = await getEnabledProviders();

  if (providers.length === 0) {
    return { success: false, error: '未設定任何 AI 供應商' };
  }

  const defaultTimeout = opts?.timeoutMs || 30000;
  const defaultRetries = opts?.maxRetries || 1;
  let lastError = '';

  for (const provider of providers) {
    const maxRetries = provider.maxRetries || defaultRetries;
    const timeoutMs = provider.timeoutMs || defaultTimeout;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const req = buildRequest(provider);

        const result = await apiQueue.enqueue(async () => {
          return callWithTimeout(
            async () => {
              const res = await fetch(req.url, {
                method: 'POST',
                headers: req.headers,
                body: JSON.stringify(req.body),
              });

              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`${provider.name} API returned ${res.status}: ${errText}`);
              }

              const data = await res.json();
              return data;
            },
            timeoutMs
          );
        });

        const content = result.choices?.[0]?.message?.content;
        if (!content) throw new Error(`${provider.name} 回應為空`);

        const parsed = JSON.parse(content);
        return { success: true, data: parsed, providerName: provider.name };
      } catch (err: any) {
        const errMsg = err.message || String(err);
        lastError = errMsg;
        if (attempt < maxRetries - 1) {
          console.warn(`[LLM Fallback] ${provider.name} attempt ${attempt + 1} failed: ${errMsg}, retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        } else {
          console.warn(`[LLM Fallback] ${provider.name} exhausted retries: ${errMsg}, trying next provider...`);
        }
      }
    }
  }

  return { success: false, error: lastError || '所有 AI 供應商均失敗' };
}

function callWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    ),
  ]);
}
