import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getAiHubMixModelProfile } from './modelCatalog';
import type { EngineConfig } from './types';
import type { ModelActualUsage } from './runtime/modelBudget';

/**
 * 模型调用层：提供商可切换。
 * - deepseek（默认，设了 DEEPSEEK_API_KEY 即启用）：V4 Pro 思考模式，
 *   通过 OpenAI 兼容 API 调用；结构化输出走 json_object 模式 + schema 注入 prompt + 解析重试。
 * - anthropic：原生 structured outputs 与 prompt cache。
 */

export type Provider = 'aihubmix' | 'anthropic' | 'deepseek';
export type ThinkingMode = 'provider_default' | 'enabled' | 'disabled';

const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-pro';
const AIHUBMIX_DEFAULT_AGENT_MODEL = 'gpt-5.6-luna';
const AIHUBMIX_DEFAULT_ANALYSIS_MODEL = 'gpt-5.6-luna';
const AIHUBMIX_DEFAULT_CONTROL_MODEL = 'deepseek-v4-flash';
const SUPPORTED_PROVIDERS = ['aihubmix', 'anthropic', 'deepseek'] as const satisfies readonly Provider[];

export interface SystemBlock {
  text: string;
  /** 稳定前缀，anthropic 路径会打 cache_control */
  cache?: boolean;
}

let anthropicClient: Anthropic | null = null;
let aihubmixClient: OpenAI | null = null;
let deepseekClient: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

function getDeepseek(): OpenAI {
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    });
  }
  return deepseekClient;
}

function getAiHubMix(): OpenAI {
  if (!aihubmixClient) {
    aihubmixClient = new OpenAI({
      apiKey: process.env.AIHUBMIX_API_KEY,
      baseURL: process.env.AIHUBMIX_BASE_URL || 'https://aihubmix.com/v1',
    });
  }
  return aihubmixClient;
}

export function currentProvider(): Provider {
  const explicit = process.env.PERSONA16_PROVIDER?.trim();
  if (explicit === 'aihubmix' || explicit === 'anthropic' || explicit === 'deepseek') return explicit;
  if (explicit) {
    throw new Error(
      `Unsupported PERSONA16_PROVIDER "${explicit}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
    );
  }
  return process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'anthropic';
}

export function defaultConfig(): EngineConfig {
  const provider = currentProvider();
  const requestedRuntime = process.env.PERSONA16_RUNTIME;
  const dft = provider === 'deepseek'
    ? { agent: DEEPSEEK_DEFAULT_MODEL, director: DEEPSEEK_DEFAULT_MODEL }
    : provider === 'aihubmix'
      ? { agent: AIHUBMIX_DEFAULT_AGENT_MODEL, director: AIHUBMIX_DEFAULT_CONTROL_MODEL }
      : { agent: 'claude-sonnet-5', director: 'claude-haiku-4-5' };
  return {
    provider,
    runtime: requestedRuntime === 'legacy' ? 'legacy' : 'pi',
    agentModel: process.env.PERSONA16_AGENT_MODEL || dft.agent,
    analysisModel: process.env.PERSONA16_ANALYSIS_MODEL
      || (provider === 'aihubmix' ? AIHUBMIX_DEFAULT_ANALYSIS_MODEL : undefined),
    directorModel: process.env.PERSONA16_DIRECTOR_MODEL || dft.director,
    traceFile: process.env.PERSONA16_TRACE_FILE,
  };
}

export function defaultJudgeModel(): string {
  return (
    process.env.PERSONA16_JUDGE_MODEL ||
    (currentProvider() === 'anthropic' ? 'claude-sonnet-5' : DEEPSEEK_DEFAULT_MODEL)
  );
}

export interface ChatTextOpts {
  /** Defaults to PERSONA16_PROVIDER/currentProvider; evals may pin providers per role. */
  provider?: Provider;
  model: string;
  system: SystemBlock[];
  prompt: string;
  maxTokens: number;
  /**
   * `null` omits the sampling override. This is required for models such as
   * Claude Sonnet 5 that reject non-default sampling parameters.
   */
  temperature?: number | null;
  /** Allows callers to use the provider default or explicitly disable thinking. */
  thinkingMode?: ThinkingMode;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
  onUsage?: (usage: Omit<ModelActualUsage, 'calls'>) => void;
}

function zeroSafe(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function deepseekCacheUsage(usage: unknown): { cacheReadTokens: number; cacheWriteTokens: number } {
  const value = (usage ?? {}) as {
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
    claude_cache_tokens_details?: {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  return {
    cacheReadTokens: zeroSafe(
      value.prompt_cache_hit_tokens ??
      value.cache_read_input_tokens ??
      value.claude_cache_tokens_details?.cache_read_input_tokens ??
      value.prompt_tokens_details?.cached_tokens,
    ),
    cacheWriteTokens: zeroSafe(
      value.cache_creation_input_tokens ??
      value.claude_cache_tokens_details?.cache_creation_input_tokens ??
      value.prompt_tokens_details?.cache_write_tokens,
    ),
  };
}

function aihubmixEstimatedCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number | undefined {
  const profile = getAiHubMixModelProfile(model);
  if (!profile) return undefined;
  const uncachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  return (
    uncachedInputTokens * profile.cost.input +
    outputTokens * profile.cost.output +
    cacheReadTokens * profile.cost.cacheRead +
    cacheWriteTokens * profile.cost.cacheWrite
  ) / 1_000_000;
}

function deepseekGenerationOptions(
  thinkingMode: ThinkingMode | undefined,
  temperature: number | null | undefined,
  defaultTemperature: number,
) {
  const resolvedThinkingMode = thinkingMode ?? 'enabled';
  return {
    ...(resolvedThinkingMode === 'provider_default'
      ? {}
      : { thinking: { type: resolvedThinkingMode } }),
    ...(resolvedThinkingMode === 'disabled' && temperature !== null
      ? { temperature: temperature ?? defaultTemperature }
      : {}),
  };
}

function aihubmixReasoningEffort(
  thinkingMode: ThinkingMode | undefined,
): 'none' | 'high' | undefined {
  const resolvedThinkingMode = thinkingMode ?? 'enabled';
  if (resolvedThinkingMode === 'provider_default') return undefined;
  return resolvedThinkingMode === 'disabled' ? 'none' : 'high';
}

/** 流式文本生成，返回完整文本 */
export async function chatText(opts: ChatTextOpts): Promise<string> {
  const provider = opts.provider ?? currentProvider();
  if (provider === 'deepseek') {
    const stream = await getDeepseek().chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      ...deepseekGenerationOptions(opts.thinkingMode, opts.temperature, 1.25),
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: opts.system.map((b) => b.text).join('\n\n') },
        { role: 'user', content: opts.prompt },
      ],
    }, { signal: opts.signal });
    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        text += delta;
        opts.onDelta?.(delta);
      }
      if (chunk.usage) {
        const cache = deepseekCacheUsage(chunk.usage);
        opts.onUsage?.({
          inputTokens: zeroSafe(chunk.usage.prompt_tokens),
          outputTokens: zeroSafe(chunk.usage.completion_tokens),
          ...cache,
        });
      }
    }
    return text.trim();
  }

  if (provider === 'aihubmix') {
    const reasoningEffort = aihubmixReasoningEffort(opts.thinkingMode);
    const stream = await getAiHubMix().chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: opts.system.map((block) => block.text).join('\n\n') },
        { role: 'user', content: opts.prompt },
      ],
    }, { signal: opts.signal });
    let text = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        text += delta;
        opts.onDelta?.(delta);
      }
      if (chunk.usage) {
        const cache = deepseekCacheUsage(chunk.usage);
        const inputTokens = zeroSafe(chunk.usage.prompt_tokens);
        const outputTokens = zeroSafe(chunk.usage.completion_tokens);
        opts.onUsage?.({
          inputTokens,
          outputTokens,
          ...cache,
          estimatedCostUsd: aihubmixEstimatedCost(
            opts.model,
            inputTokens,
            outputTokens,
            cache.cacheReadTokens,
            cache.cacheWriteTokens,
          ),
        });
      }
    }
    return text.trim();
  }

  const stream = getAnthropic().messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system.map((b) => ({
      type: 'text' as const,
      text: b.text,
      ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    })),
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: { effort: 'low' },
    ...(opts.thinkingMode === 'disabled'
      ? { thinking: { type: 'disabled' as const } }
      : {}),
    ...(typeof opts.temperature === 'number'
      ? { temperature: opts.temperature }
      : {}),
  }, { signal: opts.signal });
  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
      opts.onDelta?.(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  opts.onUsage?.({
    inputTokens: zeroSafe(final.usage.input_tokens),
    outputTokens: zeroSafe(final.usage.output_tokens),
    cacheReadTokens: zeroSafe(final.usage.cache_read_input_tokens),
    cacheWriteTokens: zeroSafe(final.usage.cache_creation_input_tokens),
  });
  return text.trim();
}

export interface ChatJsonOpts {
  /** Defaults to PERSONA16_PROVIDER/currentProvider; evals may pin providers per role. */
  provider?: Provider;
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  /**
   * DeepSeek only applies temperature when thinking is explicitly disabled.
   * `null` omits the sampling override.
   */
  temperature?: number | null;
  thinkingMode?: ThinkingMode;
  signal?: AbortSignal;
  onUsage?: (usage: Omit<ModelActualUsage, 'calls'>) => void;
}

function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1]!.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

/** 结构化 JSON 生成，deepseek 路径带一次解析重试 */
export async function chatJson<T>(opts: ChatJsonOpts): Promise<T> {
  const provider = opts.provider ?? currentProvider();
  if (provider === 'deepseek' || provider === 'aihubmix') {
    const system = `${opts.system}

你必须输出一个 JSON 对象（不要 markdown 代码块、不要解释文字），严格符合以下 JSON Schema：
${JSON.stringify(opts.schema)}`;
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = provider === 'deepseek' ? getDeepseek() : getAiHubMix();
      const response = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        ...(provider === 'deepseek'
          ? deepseekGenerationOptions(opts.thinkingMode, opts.temperature, 0)
          : { reasoning_effort: 'none' as const }),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: attempt === 0
              ? opts.prompt
              : `${opts.prompt}\n\n（上一次输出不是合法 JSON：${lastError}。重新输出严格符合 schema 的 JSON。）`,
          },
        ],
      }, { signal: opts.signal });
      const raw = response.choices[0]?.message?.content ?? '';
      const cache = deepseekCacheUsage(response.usage);
      const inputTokens = zeroSafe(response.usage?.prompt_tokens);
      const outputTokens = zeroSafe(response.usage?.completion_tokens);
      opts.onUsage?.({
        inputTokens,
        outputTokens,
        ...cache,
        ...(provider === 'aihubmix'
          ? {
            estimatedCostUsd: aihubmixEstimatedCost(
              opts.model,
              inputTokens,
              outputTokens,
              cache.cacheReadTokens,
              cache.cacheWriteTokens,
            ),
          }
          : {}),
      });
      try {
        return JSON.parse(extractJson(raw)) as T;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(`${provider} JSON 输出解析失败：${lastError}`);
  }

  const response = await getAnthropic().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: { format: { type: 'json_schema', schema: opts.schema } },
    ...(opts.thinkingMode === 'disabled'
      ? { thinking: { type: 'disabled' as const } }
      : {}),
    ...(typeof opts.temperature === 'number'
      ? { temperature: opts.temperature }
      : {}),
  }, { signal: opts.signal });
  const text = response.content.find((b) => b.type === 'text');
  opts.onUsage?.({
    inputTokens: zeroSafe(response.usage.input_tokens),
    outputTokens: zeroSafe(response.usage.output_tokens),
    cacheReadTokens: zeroSafe(response.usage.cache_read_input_tokens),
    cacheWriteTokens: zeroSafe(response.usage.cache_creation_input_tokens),
  });
  if (!text || text.type !== 'text') {
    throw new Error(`structured output returned no text (stop_reason=${response.stop_reason})`);
  }
  return JSON.parse(text.text) as T;
}
