import { Agent, type AgentMessage, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core';
import { createModels, type Api, type AssistantMessage, type Model, type Models, type TSchema, type Usage } from '@earendil-works/pi-ai';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import type {
  AgentRuntime,
  RuntimeEvent,
  RuntimeMessage,
  RuntimeModelRef,
  RuntimeRequest,
  RuntimeStopReason,
  RuntimeTool,
} from '@persona16/engine';

export interface PiAgentRuntimeOptions {
  models?: Models;
  resolveModel?: (ref: RuntimeModelRef, models: Models) => Model<Api> | undefined;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) return Promise.resolve({ done: false, value });
        if (this.closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function toAgentMessage(message: RuntimeMessage, model: Model<Api>): AgentMessage {
  if (message.role === 'user') {
    return { role: 'user', content: message.content, timestamp: Date.now() };
  }
  return {
    role: 'assistant',
    content: [{ type: 'text', text: message.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: EMPTY_USAGE,
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function toPiTool(tool: RuntimeTool): AgentTool<TSchema, Record<string, unknown>> {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as TSchema,
    async execute(_callId, input, signal) {
      const fallback = new AbortController();
      const result = await tool.execute(input, signal ?? fallback.signal);
      return {
        content: [{ type: 'text', text: result.content }],
        details: result.details ?? {},
        terminate: result.terminate,
      };
    },
  };
}

function assistantText(message: AssistantMessage | undefined): string {
  if (!message) return '';
  return message.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('')
    .trim();
}

function addUsage(target: Usage, usage: Usage): void {
  target.input += usage.input;
  target.output += usage.output;
  target.cacheRead += usage.cacheRead;
  target.cacheWrite += usage.cacheWrite;
  target.totalTokens += usage.totalTokens;
  target.cost.input += usage.cost.input;
  target.cost.output += usage.cost.output;
  target.cost.cacheRead += usage.cost.cacheRead;
  target.cost.cacheWrite += usage.cost.cacheWrite;
  target.cost.total += usage.cost.total;
}

function mapStopReason(
  message: AssistantMessage | undefined,
  forcedStop?: Extract<RuntimeStopReason, 'max_turns' | 'timeout' | 'aborted'>,
): RuntimeStopReason {
  if (forcedStop) return forcedStop;
  if (!message) return 'error';
  if (message.stopReason === 'length') return 'max_tokens';
  if (message.stopReason === 'aborted') return 'aborted';
  if (message.stopReason === 'error') return 'error';
  return 'complete';
}

function resolveLegacyDeepSeek(ref: RuntimeModelRef, models: Models): Model<Api> | undefined {
  if (ref.provider !== 'deepseek' || ref.id !== 'deepseek-chat') return undefined;
  const template = models.getModels('deepseek')[0];
  if (!template) return undefined;
  return {
    ...template,
    id: ref.id,
    name: 'DeepSeek Chat (legacy persona16 alias)',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    reasoning: false,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function defaultResolveModel(ref: RuntimeModelRef, models: Models): Model<Api> | undefined {
  return models.getModel(ref.provider, ref.id) ?? resolveLegacyDeepSeek(ref, models);
}

function defaultModels(): Models {
  const models = createModels();
  models.setProvider(deepseekProvider());
  return models;
}

export class PiAgentRuntime implements AgentRuntime {
  private readonly models: Models;
  private readonly resolveModel: NonNullable<PiAgentRuntimeOptions['resolveModel']>;
  private readonly activeRuns = new Map<string, Agent>();

  constructor(options: PiAgentRuntimeOptions = {}) {
    this.models = options.models ?? defaultModels();
    this.resolveModel = options.resolveModel ?? defaultResolveModel;
  }

  async *run(request: RuntimeRequest, signal?: AbortSignal): AsyncIterable<RuntimeEvent> {
    if (this.activeRuns.has(request.runId)) {
      yield {
        type: 'run_error',
        code: 'duplicate_run_id',
        message: `run already active: ${request.runId}`,
        recoverable: false,
      };
      return;
    }

    const model = this.resolveModel(request.model, this.models);
    if (!model) {
      yield {
        type: 'run_error',
        code: 'model_not_found',
        message: `unknown model: ${request.model.provider}/${request.model.id}`,
        recoverable: false,
      };
      return;
    }
    if (request.messages.length === 0 || request.messages.at(-1)?.role !== 'user') {
      yield {
        type: 'run_error',
        code: 'invalid_messages',
        message: 'runtime messages must end with a user message',
        recoverable: false,
      };
      return;
    }

    const queue = new AsyncEventQueue<RuntimeEvent>();
    const usage: Usage = structuredClone(EMPTY_USAGE);
    let lastAssistant: AssistantMessage | undefined;
    let forcedStop: Extract<RuntimeStopReason, 'max_turns' | 'timeout' | 'aborted'> | undefined;
    let turnCount = 0;
    let ended = false;

    const streamFn: StreamFn = (activeModel, context, options) =>
      this.models.streamSimple(activeModel, context, {
        ...options,
        maxTokens: request.limits.maxTokens,
        temperature: request.temperature,
      });

    const agent = new Agent({
      initialState: {
        systemPrompt: request.system.map((block) => block.text).join('\n\n'),
        model,
        thinkingLevel: 'off',
        tools: (request.tools ?? []).map(toPiTool),
        messages: request.messages.map((message) => toAgentMessage(message, model)),
      },
      streamFn,
      sessionId: request.metadata.roomId,
      toolExecution: 'sequential',
    });

    const unsubscribe = agent.subscribe((event) => {
      if (event.type === 'agent_start') {
        queue.push({ type: 'run_start', runId: request.runId });
      } else if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        queue.push({ type: 'text_delta', delta: event.assistantMessageEvent.delta });
      } else if (event.type === 'tool_execution_start') {
        queue.push({ type: 'tool_start', callId: event.toolCallId, name: event.toolName, input: event.args });
      } else if (event.type === 'tool_execution_end') {
        queue.push({
          type: 'tool_end',
          callId: event.toolCallId,
          name: event.toolName,
          result: {
            content: event.result.content
              .filter((item: { type: string }) => item.type === 'text')
              .map((item: { text: string }) => item.text)
              .join(''),
            details: typeof event.result.details === 'object' && event.result.details
              ? event.result.details as Record<string, unknown>
              : {},
            terminate: event.result.terminate,
          },
        });
      } else if (event.type === 'turn_end' && event.message.role === 'assistant') {
        lastAssistant = event.message;
        addUsage(usage, event.message.usage);
        turnCount += 1;
        if (event.message.stopReason === 'toolUse' && turnCount >= request.limits.maxTurns) {
          forcedStop = 'max_turns';
          agent.abort();
        }
      } else if (event.type === 'agent_end') {
        ended = true;
        if (usage.totalTokens > 0 || usage.cost.total > 0) {
          queue.push({
            type: 'usage',
            inputTokens: usage.input,
            outputTokens: usage.output,
            ...(usage.cost.total > 0 ? { estimatedCostUsd: usage.cost.total } : {}),
          });
        }
        const stopReason = mapStopReason(lastAssistant, forcedStop);
        if (stopReason === 'error') {
          queue.push({
            type: 'run_error',
            code: 'provider_error',
            message: lastAssistant?.errorMessage ?? agent.state.errorMessage ?? 'Pi runtime failed',
            recoverable: true,
          });
        }
        queue.push({ type: 'run_end', text: assistantText(lastAssistant), stopReason });
      }
    });

    const onExternalAbort = () => {
      forcedStop = 'aborted';
      agent.abort();
    };
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    const timeout = setTimeout(() => {
      forcedStop = 'timeout';
      agent.abort();
    }, request.limits.timeoutMs);

    this.activeRuns.set(request.runId, agent);
    void agent.continue()
      .catch((error: unknown) => {
        queue.push({
          type: 'run_error',
          code: 'runtime_error',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      })
      .finally(() => {
        if (!ended) {
          queue.push({
            type: 'run_end',
            text: assistantText(lastAssistant),
            stopReason: forcedStop ?? 'error',
          });
        }
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onExternalAbort);
        unsubscribe();
        this.activeRuns.delete(request.runId);
        queue.close();
      });

    yield* queue;
  }

  async abort(runId: string): Promise<void> {
    const agent = this.activeRuns.get(runId);
    if (!agent) return;
    agent.abort();
    await agent.waitForIdle();
  }
}
