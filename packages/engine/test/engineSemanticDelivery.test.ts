import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RuntimeExecutionError,
  TurnTimingRecorder,
  createRoom,
  runTurn,
} from '../src';
import {
  compileSemanticTurnControl,
  validateSemanticTurnDelivery,
} from '../src/semanticTurnControl';
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
  const timing = new TurnTimingRecorder();
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
      timing,
    },
  );
  return { result, deltas, latency: timing.snapshot() };
}

test('production delivery gate covers first pass, retry recovery, and role fallback', async () => {
  const firstPass = await runSingleTurn(
    '你就听我说一会儿。',
    ['我在听。'],
  );
  assert.deepEqual(firstPass.deltas, ['我在听。']);
  assert.equal(firstPass.result.utterances[0]?.regenerated, false);
  assert.deepEqual(Object.keys(firstPass.latency.stagesMs).sort(), [
    'delivery_validation',
    'director',
    'persona_generation',
  ]);
  assert.deepEqual(firstPass.latency.counts, {
    persona_generation: 1,
    delivery_validation: 1,
  });

  const retry = await runSingleTurn(
    '你就听我说一会儿。',
    ['我在听。你接下来想先说哪一部分？', '我在听。'],
  );
  assert.deepEqual(retry.deltas, ['我在听。']);
  assert.equal(retry.result.utterances[0]?.regenerated, true);
  assert.equal(retry.latency.counts.persona_generation, 2);
  assert.equal(retry.latency.counts.delivery_validation, 2);

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
  assert.equal(fallback.latency.counts.persona_generation, 2);
  assert.equal(fallback.latency.counts.delivery_validation, 3);
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

test('boundary repair uses a validated policy response without another model call', async () => {
  const repair = await runSingleTurn(
    '你刚才又开始分析我了。我只想被听见，不要再给建议。',
    [],
  );

  assert.equal(repair.deltas.length, 1);
  assert.match(repair.deltas[0] ?? '', /越界/u);
  assert.match(repair.deltas[0] ?? '', /停|收手/u);
  assert.equal(repair.result.utterances[0]?.regenerated, false);
});

test('relational production delivery emits a validated mutter before reply and persists it on the utterance', async () => {
  const events: string[] = [];
  const room = createRoom(['INTJ']);
  const result = await runTurn(
    room,
    '今天发生了一件挺难开口的事。',
    {
      turnId: 'relational-mutter-delivery',
      promptVersion: 'web-relational-v10',
      onSpeakerStart: () => events.push('speaker_start'),
      onMutter: (_agent, mutter) => events.push(`mutter:${mutter}`),
      onDelta: (_agent, delta) => events.push(`delta:${delta}`),
      onSpeakerEnd: () => events.push('speaker_end'),
    },
    config,
    {
      runtime: queuedRuntime([
        '{"mutter":"这句话像是压了很久。","reply":"不用急着讲完整，我在听。"}',
      ]),
      director: async () => directorDecision,
    },
  );

  assert.deepEqual(events, [
    'speaker_start',
    'mutter:这句话像是压了很久。',
    'delta:不用急着讲完整，我在听。',
    'speaker_end',
  ]);
  assert.equal(result.utterances[0]?.mutter, '这句话像是压了很久。');
  assert.equal(room.history.at(-1)?.mutter, '这句话像是压了很久。');
  assert.equal(room.history.at(-1)?.text, '不用急着讲完整，我在听。');
});

test('relational delivery drops mutter for a direct technical task while preserving the validated reply', async () => {
  const mutters: string[] = [];
  const deltas: string[] = [];
  await runTurn(
    createRoom(['INTJ']),
    '这个 TypeScript 报错怎么修？',
    {
      turnId: 'relational-mutter-suppressed',
      promptVersion: 'web-relational-v10',
      onMutter: (_agent, mutter) => mutters.push(mutter),
      onDelta: (_agent, delta) => deltas.push(delta),
    },
    config,
    {
      runtime: queuedRuntime([
        '{"mutter":"这个报错点有点隐蔽。","reply":"把完整错误栈和相关代码贴出来，我先定位第一处失败。"}',
      ]),
      director: async () => directorDecision,
    },
  );

  assert.deepEqual(mutters, []);
  assert.deepEqual(deltas, ['把完整错误栈和相关代码贴出来，我先定位第一处失败。']);
});

test('relational delivery retries a missing structured envelope before publishing any text', async () => {
  const deltas: string[] = [];
  const result = await runTurn(
    createRoom(['INTJ']),
    '今天发生了一件挺难开口的事。',
    {
      turnId: 'relational-protocol-retry',
      promptVersion: 'web-relational-v10',
      onDelta: (_agent, delta) => deltas.push(delta),
    },
    config,
    {
      runtime: queuedRuntime([
        '不用急着讲完整，我在听。',
        '{"mutter":null,"reply":"不用急着讲完整，我在听。"}',
      ]),
      director: async () => directorDecision,
    },
  );

  assert.deepEqual(deltas, ['不用急着讲完整，我在听。']);
  assert.equal(result.utterances[0]?.regenerated, true);
});

test('relational delivery treats a missing default mutter as an optional omission', async () => {
  const mutters: string[] = [];
  const deltas: string[] = [];
  const result = await runTurn(
    createRoom(['INTJ']),
    '今天发生了一件挺难开口的事。',
    {
      turnId: 'relational-mutter-retry',
      promptVersion: 'web-relational-v10',
      onMutter: (_agent, mutter) => mutters.push(mutter),
      onDelta: (_agent, delta) => deltas.push(delta),
    },
    config,
    {
      runtime: queuedRuntime([
        '{"mutter":null,"reply":"不用急着讲完整，我在听。"}',
      ]),
      director: async () => directorDecision,
    },
  );

  assert.deepEqual(mutters, []);
  assert.deepEqual(deltas, ['不用急着讲完整，我在听。']);
  assert.equal(result.utterances[0]?.regenerated, false);
});

test('relational protocol repair keeps the semantic rewrite attempt available', async () => {
  const deltas: string[] = [];
  const result = await runTurn(
    createRoom(['INTJ']),
    '你就听我说一会儿。',
    {
      turnId: 'relational-protocol-then-semantic-retry',
      promptVersion: 'web-relational-v10',
      onDelta: (_agent, delta) => deltas.push(delta),
    },
    config,
    {
      runtime: queuedRuntime([
        '我在听。',
        '{"mutter":null,"reply":"我在听。你接下来想先说哪一部分？"}',
        '{"mutter":null,"reply":"我在听。"}',
      ]),
      director: async () => directorDecision,
    },
  );

  assert.deepEqual(deltas, ['我在听。']);
  assert.equal(result.utterances[0]?.regenerated, true);
});

test('relational delivery blocks repeatedly malformed JSON without leaking raw text', async () => {
  const deltas: string[] = [];
  await assert.rejects(
    runTurn(
      createRoom(['INTJ']),
      '今天发生了一件挺难开口的事。',
      {
        turnId: 'relational-protocol-hard-stop',
        promptVersion: 'web-relational-v10',
        onDelta: (_agent, delta) => deltas.push(delta),
      },
      config,
      {
        runtime: queuedRuntime([
          '{"mutter":null,"reply":"我在听。"',
          '{"mutter":null,"reply":"我在听。"',
          '{"mutter":null,"reply":"我在听。"',
        ]),
        director: async () => directorDecision,
      },
    ),
    (error: unknown) => (
      error instanceof RuntimeExecutionError
      && error.code === 'structured_output_missing'
    ),
  );
  assert.deepEqual(deltas, []);
});

test('delivery authorization matches the bounded relationship evidence rendered to the model', () => {
  const control = compileSemanticTurnControl({
    userMessage: '你还记得我到底吃不吃香菜吗？',
    relationshipFocus: 'ordinary',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [
        {
          id: 'pref-coriander-old',
          kind: 'preference',
          content: '用户以前明确说不吃香菜',
          traceability: 'traceable',
          sourceTurnId: 'turn-old',
          sourceMessageId: 'message-old',
          recordedAt: '2026-08-02T00:00:00.000Z',
        },
        {
          id: 'pref-coriander-new',
          kind: 'preference',
          content: '用户后来明确说最近开始吃香菜',
          traceability: 'traceable',
          sourceTurnId: 'turn-new',
          sourceMessageId: 'message-new',
          recordedAt: '2026-08-06T00:00:00.000Z',
        },
      ],
    },
  });

  assert.deepEqual(control.plan.allowedEvidenceIds, [
    'current:user-message',
    'pref-coriander-old',
    'pref-coriander-new',
  ]);
  assert.deepEqual(
    validateSemanticTurnDelivery(
      '记得。你以前说不吃，后来又说最近开始吃了。我记对了吗？',
      control.plan,
    ).blockingViolations,
    [],
  );
});

test('boundary repair distinguishes negated past actions from an actual terminal stop', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我已经说了只想被听见，你还是一直替我安排下一步。现在别解释好意。',
  });
  assert.deepEqual(
    validateSemanticTurnDelivery(
      '你说得对，我说过只想被听见，却还是没停。现在不说了。',
      control.plan,
    ).blockingViolations.map(({ code }) => code),
    ['required_semantic_move_missing', 'unsupported_shared_history'],
  );
  assert.deepEqual(
    validateSemanticTurnDelivery(
      '你说得对，我越界了。你只想被听见，我却一直给方案。现在停了，不解释，只听你说。',
      control.plan,
    ).blockingViolations,
    [],
  );
});
