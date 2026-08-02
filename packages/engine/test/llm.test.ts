import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { chatJson, chatText, defaultConfig, defaultJudgeModel } from '../src/llm';

const MODEL_ENV_KEYS = [
  'PERSONA16_PROVIDER',
  'PERSONA16_RUNTIME',
  'PERSONA16_AGENT_MODEL',
  'PERSONA16_ANALYSIS_MODEL',
  'PERSONA16_DIRECTOR_MODEL',
  'PERSONA16_JUDGE_MODEL',
] as const;

test('uses explicit DeepSeek V4 Pro model IDs for every default role', () => {
  const previous = Object.fromEntries(MODEL_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    process.env.PERSONA16_PROVIDER = 'deepseek';
    delete process.env.PERSONA16_AGENT_MODEL;
    delete process.env.PERSONA16_ANALYSIS_MODEL;
    delete process.env.PERSONA16_DIRECTOR_MODEL;
    delete process.env.PERSONA16_JUDGE_MODEL;

    const config = defaultConfig();

    assert.equal(config.agentModel, 'deepseek-v4-pro');
    assert.equal(config.directorModel, 'deepseek-v4-pro');
    assert.equal(defaultJudgeModel(), 'deepseek-v4-pro');
  } finally {
    for (const key of MODEL_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('uses Pi runtime and Anthropic model defaults when Anthropic is selected', () => {
  const previous = Object.fromEntries(MODEL_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    process.env.PERSONA16_PROVIDER = 'anthropic';
    delete process.env.PERSONA16_RUNTIME;
    delete process.env.PERSONA16_AGENT_MODEL;
    delete process.env.PERSONA16_ANALYSIS_MODEL;
    delete process.env.PERSONA16_DIRECTOR_MODEL;
    delete process.env.PERSONA16_JUDGE_MODEL;

    const config = defaultConfig();

    assert.deepEqual(
      {
        provider: config.provider,
        runtime: config.runtime,
        agentModel: config.agentModel,
        analysisModel: config.analysisModel,
        directorModel: config.directorModel,
        judgeModel: defaultJudgeModel(),
      },
      {
        provider: 'anthropic',
        runtime: 'pi',
        agentModel: 'claude-sonnet-5',
        analysisModel: undefined,
        directorModel: 'claude-haiku-4-5',
        judgeModel: 'claude-sonnet-5',
      },
    );
  } finally {
    for (const key of MODEL_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('uses curated Pi and control model defaults when AIHubMix is selected', () => {
  const previous = Object.fromEntries(MODEL_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    process.env.PERSONA16_PROVIDER = 'aihubmix';
    delete process.env.PERSONA16_RUNTIME;
    delete process.env.PERSONA16_AGENT_MODEL;
    delete process.env.PERSONA16_ANALYSIS_MODEL;
    delete process.env.PERSONA16_DIRECTOR_MODEL;
    delete process.env.PERSONA16_JUDGE_MODEL;

    const config = defaultConfig();

    assert.deepEqual(
      {
        provider: config.provider,
        runtime: config.runtime,
        agentModel: config.agentModel,
        analysisModel: config.analysisModel,
        directorModel: config.directorModel,
        judgeModel: defaultJudgeModel(),
      },
      {
        provider: 'aihubmix',
        runtime: 'pi',
        agentModel: 'gpt-5.6-luna',
        analysisModel: 'gpt-5.6-luna',
        directorModel: 'deepseek-v4-flash',
        judgeModel: 'deepseek-v4-pro',
      },
    );
  } finally {
    for (const key of MODEL_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('rejects an explicitly unsupported provider instead of silently falling back', () => {
  const previous = process.env.PERSONA16_PROVIDER;
  try {
    process.env.PERSONA16_PROVIDER = 'unsupported-provider';

    assert.throws(
      () => defaultConfig(),
      /Unsupported PERSONA16_PROVIDER "unsupported-provider".*aihubmix, anthropic, deepseek/,
    );
  } finally {
    if (previous === undefined) delete process.env.PERSONA16_PROVIDER;
    else process.env.PERSONA16_PROVIDER = previous;
  }
});

test('AIHubMix uses high reasoning for persona text and no reasoning for structured control', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const usage: Array<{ estimatedCostUsd?: number }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      requests.push(body);
      if (body.stream === true) {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'x-aihubmix-model': String(body.model),
        });
        response.end([
          `data: {"id":"chatcmpl-gateway","object":"chat.completion.chunk","created":0,"model":"${String(body.model)}","choices":[{"index":0,"delta":{"content":"收到"},"finish_reason":null}]}`,
          `data: {"id":"chatcmpl-gateway","object":"chat.completion.chunk","created":0,"model":"${String(body.model)}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}`,
          'data: [DONE]',
          '',
        ].join('\n\n'));
        return;
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        'x-aihubmix-model': String(body.model),
      });
      response.end(JSON.stringify({
        id: 'chatcmpl-gateway',
        object: 'chat.completion',
        created: 0,
        model: String(body.model),
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"ok":true}' },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 2,
          total_tokens: 6,
          prompt_cache_hit_tokens: 1,
          prompt_cache_miss_tokens: 3,
        },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const previousApiKey = process.env.AIHUBMIX_API_KEY;
  const previousBaseUrl = process.env.AIHUBMIX_BASE_URL;
  try {
    const address = server.address() as AddressInfo;
    process.env.AIHUBMIX_API_KEY = 'test-only-key';
    process.env.AIHUBMIX_BASE_URL = `http://127.0.0.1:${address.port}`;

    await chatText({
      provider: 'aihubmix',
      model: 'claude-haiku-4-5',
      system: [{ text: 'system' }],
      prompt: 'text',
      maxTokens: 32,
      onUsage: (value) => usage.push(value),
    });
    await chatJson<{ ok: boolean }>({
      provider: 'aihubmix',
      model: 'deepseek-v4-flash',
      system: 'system',
      prompt: 'json',
      schema: { type: 'object' },
      maxTokens: 32,
      onUsage: (value) => usage.push(value),
    });

    assert.deepEqual(
      requests.map((request) => ({
        model: request.model,
        reasoningEffort: request.reasoning_effort,
        hasTemperature: Object.hasOwn(request, 'temperature'),
        responseFormat: request.response_format,
      })),
      [
        {
          model: 'claude-haiku-4-5',
          reasoningEffort: 'high',
          hasTemperature: false,
          responseFormat: undefined,
        },
        {
          model: 'deepseek-v4-flash',
          reasoningEffort: 'none',
          hasTemperature: false,
          responseFormat: { type: 'json_object' },
        },
      ],
    );
    assert.ok(Math.abs((usage[0]?.estimatedCostUsd ?? 0) - 0.0000154) < 1e-12);
    assert.ok(Math.abs((usage[1]?.estimatedCostUsd ?? 0) - 0.00000108108) < 1e-12);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousApiKey === undefined) delete process.env.AIHUBMIX_API_KEY;
    else process.env.AIHUBMIX_API_KEY = previousApiKey;
    if (previousBaseUrl === undefined) delete process.env.AIHUBMIX_BASE_URL;
    else process.env.AIHUBMIX_BASE_URL = previousBaseUrl;
  }
});

test('DeepSeek production calls enable thinking while explicit disabled calls stay non-thinking', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      requests.push(body);
      if (body.stream === true) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end([
          'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"收到"},"finish_reason":null}]}',
          'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}',
          'data: [DONE]',
          '',
        ].join('\n\n'));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 0,
        model: 'deepseek-v4-pro',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"ok":true}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const previousApiKey = process.env.DEEPSEEK_API_KEY;
  const previousBaseUrl = process.env.DEEPSEEK_BASE_URL;
  try {
    const address = server.address() as AddressInfo;
    process.env.DEEPSEEK_API_KEY = 'test-only-key';
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${address.port}`;

    await chatText({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      system: [{ text: 'system' }],
      prompt: 'text',
      maxTokens: 32,
    });
    await chatText({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      system: [{ text: 'system' }],
      prompt: 'text disabled',
      maxTokens: 32,
      temperature: 0.7,
      thinkingMode: 'disabled',
    });
    await chatJson<{ ok: boolean }>({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      system: 'system',
      prompt: 'json',
      schema: { type: 'object' },
      maxTokens: 32,
    });
    await chatJson<{ ok: boolean }>({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      system: 'system',
      prompt: 'json disabled',
      schema: { type: 'object' },
      maxTokens: 32,
      thinkingMode: 'disabled',
    });

    assert.deepEqual(
      requests.map((request) => ({
        thinking: request.thinking,
        hasTemperature: Object.hasOwn(request, 'temperature'),
        temperature: request.temperature,
      })),
      [
        { thinking: { type: 'enabled' }, hasTemperature: false, temperature: undefined },
        { thinking: { type: 'disabled' }, hasTemperature: true, temperature: 0.7 },
        { thinking: { type: 'enabled' }, hasTemperature: false, temperature: undefined },
        { thinking: { type: 'disabled' }, hasTemperature: true, temperature: 0 },
      ],
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousApiKey;
    if (previousBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = previousBaseUrl;
  }
});
