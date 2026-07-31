import {
  createProvider,
  envApiKeyAuth,
  type Model,
  type Provider,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { AIHUBMIX_MODEL_PROFILES } from '@persona16/engine/model-catalog';

const DEFAULT_BASE_URL = 'https://aihubmix.com/v1';

export function aihubmixProvider(): Provider<'openai-completions'> {
  const baseUrl = process.env.AIHUBMIX_BASE_URL || DEFAULT_BASE_URL;
  const models: Model<'openai-completions'>[] = AIHUBMIX_MODEL_PROFILES.map((profile) => ({
    id: profile.id,
    name: profile.name,
    api: 'openai-completions',
    provider: 'aihubmix',
    baseUrl,
    reasoning: profile.reasoning,
    input: ['text'],
    cost: profile.cost,
    contextWindow: profile.contextWindow,
    maxTokens: profile.maxTokens,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
      maxTokensField: 'max_tokens',
      thinkingFormat: 'openai',
      ...(profile.cacheControlFormat
        ? { cacheControlFormat: profile.cacheControlFormat }
        : {}),
    },
  }));

  return createProvider({
    id: 'aihubmix',
    name: 'AIHubMix',
    baseUrl,
    auth: {
      apiKey: envApiKeyAuth('AIHubMix API key', ['AIHUBMIX_API_KEY']),
    },
    models,
    api: openAICompletionsApi(),
  });
}
