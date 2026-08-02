export interface GatewayModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface GatewayModelProfile {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  cost: GatewayModelCost;
  cacheControlFormat?: 'anthropic';
  /**
   * Some compatibility layers translate reasoning effort into a thinking-token
   * budget that must fit inside max_tokens. Below this limit, reasoning is
   * intentionally disabled instead of sending a request the upstream rejects.
   */
  minimumReasoningMaxTokens?: number;
}

/**
 * 只收录经过 persona16 接入测试的 AIHubMix 文本模型。
 * 价格单位为 USD / 1M tokens，来源于 AIHubMix 模型目录。
 */
export const AIHUBMIX_MODEL_PROFILES: readonly GatewayModelProfile[] = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash via AIHubMix',
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    cost: { input: 0.154, output: 0.308, cacheRead: 0.00308, cacheWrite: 0 },
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro via AIHubMix',
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    cost: { input: 0.464, output: 0.928, cacheRead: 0.003851, cacheWrite: 0 },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5 via AIHubMix',
    reasoning: true,
    contextWindow: 204_800,
    maxTokens: 131_072,
    cost: { input: 1.1, output: 5.5, cacheRead: 0.11, cacheWrite: 1.375 },
    cacheControlFormat: 'anthropic',
    minimumReasoningMaxTokens: 2_048,
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5 via AIHubMix',
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    cacheControlFormat: 'anthropic',
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna via AIHubMix',
    reasoning: true,
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    cost: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra via AIHubMix',
    reasoning: true,
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    cost: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite via AIHubMix',
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    cost: { input: 0.25, output: 1.5, cacheRead: 0.25, cacheWrite: 0 },
  },
  {
    id: 'gemini-3.1-flash-lite-nothink',
    name: 'Gemini 3.1 Flash Lite No-think via AIHubMix',
    reasoning: false,
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    cost: { input: 0.25, output: 1.5, cacheRead: 0.25, cacheWrite: 0 },
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview via AIHubMix',
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    cost: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  },
] as const;

export function getAiHubMixModelProfile(model: string): GatewayModelProfile | undefined {
  return AIHUBMIX_MODEL_PROFILES.find((candidate) => candidate.id === model);
}
