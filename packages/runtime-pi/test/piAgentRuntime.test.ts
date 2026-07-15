import assert from 'node:assert/strict';
import test from 'node:test';
import { createModels, fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai';
import type { RuntimeEvent, RuntimeRequest } from '@persona16/engine';
import { PiAgentRuntime } from '../src';

function request(provider: string, model: string, runId = 'run-1'): RuntimeRequest {
  return {
    runId,
    model: { provider, id: model },
    system: [{ text: '你是一个测试人格。' }],
    messages: [{ role: 'user', content: '说一句话。' }],
    limits: { maxTurns: 1, maxTokens: 100, timeoutMs: 2_000 },
    metadata: {
      roomId: 'room-1',
      turnId: 'turn-1',
      agent: 'INTJ',
      promptVersion: 'test-v1',
    },
  };
}

async function collect(runtime: PiAgentRuntime, input: RuntimeRequest, signal?: AbortSignal) {
  const events: RuntimeEvent[] = [];
  for await (const event of runtime.run(input, signal)) events.push(event);
  return events;
}

test('maps Pi lifecycle and text streaming into runtime events', async () => {
  const faux = fauxProvider({ models: [{ id: 'persona-test' }], tokensPerSecond: 100_000 });
  faux.setResponses([fauxAssistantMessage('冷静一点，先看变量。')]);
  const models = createModels();
  models.setProvider(faux.provider);
  const runtime = new PiAgentRuntime({ models });

  const events = await collect(runtime, request(faux.provider.id, 'persona-test'));

  assert.equal(events[0]?.type, 'run_start');
  assert.equal(events.filter((event) => event.type === 'text_delta').map((event) => event.delta).join(''), '冷静一点，先看变量。');
  assert.deepEqual(events.at(-1), {
    type: 'run_end',
    text: '冷静一点，先看变量。',
    stopReason: 'complete',
  });
  const usage = events.find((event) => event.type === 'usage');
  assert.equal(usage?.type, 'usage');
  if (usage?.type === 'usage') {
    assert.ok(usage.inputTokens > 0);
    assert.ok(usage.outputTokens > 0);
  }
});

test('returns a typed error when the model cannot be resolved', async () => {
  const models = createModels();
  const runtime = new PiAgentRuntime({ models });

  const events = await collect(runtime, request('missing', 'missing'));

  assert.deepEqual(events, [{
    type: 'run_error',
    code: 'model_not_found',
    message: 'unknown model: missing/missing',
    recoverable: false,
  }]);
});

test('rejects transcripts that do not end with a user message', async () => {
  const faux = fauxProvider({ models: [{ id: 'persona-test' }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const runtime = new PiAgentRuntime({ models });
  const input = request(faux.provider.id, 'persona-test');
  input.messages = [{ role: 'assistant', content: '旧回复' }];

  const events = await collect(runtime, input);

  assert.equal(events[0]?.type, 'run_error');
  assert.equal(events[0]?.type === 'run_error' ? events[0].code : '', 'invalid_messages');
});

test('supports external cancellation', async () => {
  const faux = fauxProvider({ models: [{ id: 'persona-test' }], tokensPerSecond: 5 });
  faux.setResponses([fauxAssistantMessage('这是一段故意放慢的长回复，用来验证取消。')]);
  const models = createModels();
  models.setProvider(faux.provider);
  const runtime = new PiAgentRuntime({ models });
  const abort = new AbortController();
  const events: RuntimeEvent[] = [];

  for await (const event of runtime.run(request(faux.provider.id, 'persona-test', 'run-abort'), abort.signal)) {
    events.push(event);
    if (event.type === 'text_delta') abort.abort();
  }

  assert.equal(events.at(-1)?.type, 'run_end');
  assert.equal(events.at(-1)?.type === 'run_end' ? events.at(-1)?.stopReason : '', 'aborted');
});

test('maps a provider failure to a recoverable runtime error and terminal event', async () => {
  const faux = fauxProvider({ models: [{ id: 'persona-test' }] });
  faux.setResponses([fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'synthetic provider failure' })]);
  const models = createModels();
  models.setProvider(faux.provider);
  const runtime = new PiAgentRuntime({ models });

  const events = await collect(runtime, request(faux.provider.id, 'persona-test', 'run-error'));

  const error = events.find((event) => event.type === 'run_error');
  assert.deepEqual(error, {
    type: 'run_error',
    code: 'provider_error',
    message: 'synthetic provider failure',
    recoverable: true,
  });
  assert.deepEqual(events.at(-1), { type: 'run_end', text: '', stopReason: 'error' });
});

test('enforces the runtime timeout', async () => {
  const faux = fauxProvider({
    models: [{ id: 'persona-test' }],
    tokensPerSecond: 100,
    tokenSize: { min: 3, max: 3 },
  });
  faux.setResponses([fauxAssistantMessage('这段回复会在第一个文本片段完成前超时。')]);
  const models = createModels();
  models.setProvider(faux.provider);
  const runtime = new PiAgentRuntime({ models });
  const input = request(faux.provider.id, 'persona-test', 'run-timeout');
  input.limits.timeoutMs = 1;

  const events = await collect(runtime, input);

  assert.deepEqual(events.at(-1), { type: 'run_end', text: '', stopReason: 'timeout' });
});
