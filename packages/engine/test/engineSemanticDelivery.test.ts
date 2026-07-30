import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RuntimeExecutionError,
  createRoom,
  runTurn,
} from '../src';
import type {
  AgentRuntime,
  DirectorDecision,
  EngineConfig,
  RuntimeEvent,
} from '../src';

const config: EngineConfig = {
  provider: 'anthropic',
  runtime: 'pi',
  agentModel: 'test-agent',
  directorModel: 'test-director',
};

const directorDecision: DirectorDecision = {
  scene: '陪伴',
  userEmotion: '稳定',
  conflictTopic: null,
  forceSummary: false,
  assessments: [{
    type: 'INTJ',
    baseImpulse: 85,
    angle: '直接回应当前要求',
    suggestedSpeechType: '短句',
  }],
};

function queuedRuntime(texts: readonly string[]): AgentRuntime {
  let index = 0;
  return {
    async *run(): AsyncIterable<RuntimeEvent> {
      const text = texts[index++];
      assert.notEqual(text, undefined, 'runtime response queue exhausted');
      yield { type: 'text_delta', delta: text! };
      yield { type: 'run_end', text: text!, stopReason: 'complete' };
    },
    async abort() {},
  };
}

async function runSingleTurn(
  userMessage: string,
  modelTexts: readonly string[],
) {
  const deltas: string[] = [];
  const result = await runTurn(
    createRoom(['INTJ']),
    userMessage,
    {
      turnId: `semantic-delivery-${modelTexts.length}`,
      onDelta: (_agent, delta) => deltas.push(delta),
    },
    config,
    {
      runtime: queuedRuntime(modelTexts),
      director: async () => directorDecision,
    },
  );
  return { result, deltas };
}

test('production delivery gate covers first pass, retry recovery, and role fallback', async () => {
  const firstPass = await runSingleTurn(
    '你就听我说一会儿。',
    ['我在听。'],
  );
  assert.deepEqual(firstPass.deltas, ['我在听。']);
  assert.equal(firstPass.result.utterances[0]?.regenerated, false);

  const retry = await runSingleTurn(
    '你就听我说一会儿。',
    ['我在听。你接下来想先说哪一部分？', '我在听。'],
  );
  assert.deepEqual(retry.deltas, ['我在听。']);
  assert.equal(retry.result.utterances[0]?.regenerated, true);

  const fallback = await runSingleTurn(
    '你就听我说一会儿。',
    [
      '我在听。你接下来想先说哪一部分？',
      '我在听。你接下来想先说哪一部分？',
    ],
  );
  assert.equal(fallback.deltas.length, 1);
  assert.match(fallback.deltas[0] ?? '', /听/u);
  assert.equal(fallback.result.utterances[0]?.regenerated, true);
});

test('production safely stops with zero delta when no valid fallback exists', async () => {
  const deltas: string[] = [];
  await assert.rejects(
    runTurn(
      createRoom(['INTJ']),
      '今天发生了一件事。',
      {
        turnId: 'semantic-delivery-no-fallback',
        onDelta: (_agent, delta) => deltas.push(delta),
      },
      config,
      {
        runtime: queuedRuntime([
          '你说过自己没用。',
          '你说过自己没用。',
        ]),
        director: async () => directorDecision,
      },
    ),
    (error: unknown) => (
      error instanceof RuntimeExecutionError
      && error.code === 'semantic_turn_violation'
    ),
  );
  assert.deepEqual(deltas, []);
});
