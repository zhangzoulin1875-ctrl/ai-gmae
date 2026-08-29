export interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'custom' | 'deterministic';
  apiKey?: string;
  endpoint?: string;
  model: string;
  priority: number;
  isEnabled: boolean;
  timeoutMs: number;
  maxRetries: number;
}

export interface FallbackChain {
  providers: AIProvider[];
  enableDeterministicFallback: boolean;
  maxTotalTimeoutMs: number;
}

export interface AIConfig {
  activeProviderId: string;
  fallbackChain: FallbackChain;
  temperature: number;
  systemPromptOverride?: string;
  updatedAt: string;
}
