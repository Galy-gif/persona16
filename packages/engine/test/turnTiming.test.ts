import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TurnTimingRecorder,
  createModelBudget,
  createRoom,
  runTurn,
  type AgentRuntime,
  type DirectorDecision,
  type EngineConfig,
  type RuntimeEvent,
} from '../src';

test('turn timing accumulates repeated stages and aliases validated output for compatibility', async () => {
  let current = 1_000;
  const timing = new TurnTimingRecorder(() => current);

  await timing.measure('persona_generation', async () => {
    current += 40;
  });
  timing.measureSync('delivery_validation', () => {
    current += 5;
  });
  await timing.measure('persona_generation', async () => {
    current += 30;
  });
  timing.markValidatedOutput();
  current += 10;

  assert.deepEqual(timing.snapshot(), {
    schemaVersion: 2,
    totalMs: 85,
    validatedOutputMs: 75,
    firstTokenMs: 75,
    stagesMs: {
      persona_generation: 70,
      delivery_validation: 5,
    },
    counts: {
      persona_generation: 2,
      delivery_validation: 1,
    },
  });
});

test('turn timing records failed operations without accepting arbitrary labels', async () => {
  let current = 0;
  const timing = new TurnTimingRecorder(() => current);

  await assert.rejects(
    timing.measure('safety', async () => {
      current += 12;
      throw new Error('synthetic failure');
    }),
    /synthetic failure/,
  );

  assert.deepEqual(timing.snapshot(), {
    schemaVersion: 2,
    totalMs: 12,
    validatedOutputMs: null,
    firstTokenMs: null,
    stagesMs: { safety: 12 },
    counts: {},
  });
});

test('multi-agent turns count every model-backed room controller decision', async () => {
  const timing = new TurnTimingRecorder();
  const config: EngineConfig = {
    provider: 'anthropic',
    runtime: 'pi',
    agentModel: 'test-agent',
    directorModel: 'test-director',
  };
  const decision: DirectorDecision = {
    scene: '陪伴',
    userEmotion: '稳定',
    conflictTopic: null,
    forceSummary: false,
    assessments: [
      { type: 'INTJ', baseImpulse: 85, angle: '先回应', suggestedSpeechType: '短句' },
      { type: 'ENFP', baseImpulse: 70, angle: '必要时补充', suggestedSpeechType: '短句' },
    ],
  };
  const runtime: AgentRuntime = {
    async *run(): AsyncIterable<RuntimeEvent> {
      yield { type: 'text_delta', delta: '我在听。' };
      yield { type: 'run_end', text: '我在听。', stopReason: 'complete' };
    },
    async abort() {},
  };

  await runTurn(
    createRoom(['INTJ', 'ENFP']),
    '我想先说说今天发生的事。',
    { turnId: 'timing-room-controller' },
    config,
    {
      timing,
      runtime,
      director: async () => decision,
      roomController: { async decide() { return { type: 'stop', reason: 'no_new_value' }; } },
    },
  );

  const latency = timing.snapshot();
  assert.equal(latency.counts.room_controller, 1);
  assert.equal(latency.counts.persona_generation, 1);
  assert.equal(latency.counts.delivery_validation, 1);
  assert.ok(latency.stagesMs.room_controller !== undefined);
});

test('bounded room greeting reserves only the persona call and still reaches delivery validation', async () => {
  const timing = new TurnTimingRecorder();
  const modelBudget = createModelBudget();
  const config: EngineConfig = {
    provider: 'anthropic',
    runtime: 'pi',
    agentModel: 'test-agent',
    directorModel: 'test-director',
  };
  const runtime: AgentRuntime = {
    async *run(): AsyncIterable<RuntimeEvent> {
      yield { type: 'text_delta', delta: '你好。' };
      yield { type: 'run_end', text: '你好。', stopReason: 'complete' };
    },
    async abort() {},
  };

  const result = await runTurn(
    createRoom(['INTJ', 'ENFP']),
    '你好～',
    { turnId: 'timing-deterministic-greeting' },
    config,
    {
      timing,
      modelBudget,
      runtime,
      roomController: { async decide() { return { type: 'stop', reason: 'no_new_value' }; } },
    },
  );

  assert.equal(result.utterances[0]?.text, '你好。');
  assert.equal(modelBudget.snapshot().reservedCalls, 1);
  const latency = timing.snapshot();
  assert.ok(latency.stagesMs.director !== undefined);
  assert.equal(latency.counts.persona_generation, 1);
  assert.equal(latency.counts.delivery_validation, 1);
});
