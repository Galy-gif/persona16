import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { EngineConfig } from './types';
import type { ModelActualUsage } from './runtime/modelBudget';

/**
 * 模型调用层：提供商可切换。
 * - deepseek（默认，设了 DEEPSEEK_API_KEY 即启用）：OpenAI 兼容 API，
 *   结构化输出走 json_object 模式 + schema 注入 prompt + 解析重试。
 * - anthropic：原生 structured outputs 与 prompt cache。
 */

export type Provider = 'anthropic' | 'deepseek';

export interface SystemBlock {
  text: string;
  /** 稳定前缀，anthropic 路径会打 cache_control */
  cache?: boolean;
}

let anthropicClient: Anthropic | null = null;
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

export function currentProvider(): Provider {
  const explicit = process.env.PERSONA16_PROVIDER as Provider | undefined;
  if (explicit === 'anthropic' || explicit === 'deepseek') return explicit;
  return process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'anthropic';
}

export function defaultConfig(): EngineConfig {
  const provider = currentProvider();
  const requestedRuntime = process.env.PERSONA16_RUNTIME;
  const dft = provider === 'deepseek'
    ? { agent: 'deepseek-chat', director: 'deepseek-chat' }
    : { agent: 'claude-sonnet-5', director: 'claude-haiku-4-5' };
  return {
    provider,
    runtime: requestedRuntime === 'legacy' || (requestedRuntime !== 'pi' && provider === 'anthropic')
      ? 'legacy'
      : 'pi',
    agentModel: process.env.PERSONA16_AGENT_MODEL || dft.agent,
    directorModel: process.env.PERSONA16_DIRECTOR_MODEL || dft.director,
    traceFile: process.env.PERSONA16_TRACE_FILE,
  };
}

export function defaultJudgeModel(): string {
  return (
    process.env.PERSONA16_JUDGE_MODEL ||
    (currentProvider() === 'deepseek' ? 'deepseek-chat' : 'claude-sonnet-5')
  );
}

export interface ChatTextOpts {
  model: string;
  system: SystemBlock[];
  prompt: string;
  maxTokens: number;
  /** 仅 deepseek 路径生效；人格发言默认 1.25（拉开声线），anthropic 不支持该参数 */
  temperature?: number;
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
    prompt_tokens_details?: { cached_tokens?: number };
  };
  return {
    cacheReadTokens: zeroSafe(value.prompt_cache_hit_tokens ?? value.prompt_tokens_details?.cached_tokens),
    cacheWriteTokens: zeroSafe(value.prompt_cache_miss_tokens),
  };
}

/** 流式文本生成，返回完整文本 */
export async function chatText(opts: ChatTextOpts): Promise<string> {
  if (currentProvider() === 'deepseek') {
    const stream = await getDeepseek().chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 1.25,
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
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
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
  if (currentProvider() === 'deepseek') {
    const system = `${opts.system}

你必须输出一个 JSON 对象（不要 markdown 代码块、不要解释文字），严格符合以下 JSON Schema：
${JSON.stringify(opts.schema)}`;
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await getDeepseek().chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: 0, // 导演与评审必须可复现
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
      opts.onUsage?.({
        inputTokens: zeroSafe(response.usage?.prompt_tokens),
        outputTokens: zeroSafe(response.usage?.completion_tokens),
        ...cache,
      });
      try {
        return JSON.parse(extractJson(raw)) as T;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(`deepseek JSON 输出解析失败：${lastError}`);
  }

  const response = await getAnthropic().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: { format: { type: 'json_schema', schema: opts.schema } },
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
