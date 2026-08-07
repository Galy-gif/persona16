import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PROMPT_BUDGET,
  PROMPT_SECTIONS,
  buildMeasuredSystemBlocks,
  buildMeasuredTurnPrompt,
  buildTurnPrompt,
  createRoom,
  runTurn,
} from '../src';
import type {
  AgentRuntime,
  DirectorDecision,
  EngineConfig,
  RuntimeEvent,
} from '../src';
import type { HostContext } from '../src/prompt';

function ordinaryContext(userMessage = '你好'): HostContext {
  const room = createRoom(['INTJ']);
  room.history.push({ speaker: 'user', text: userMessage });
  return {
    room,
    userMessage,
    earlierThisTurn: [],
    plan: {
      scene: '闲聊',
      userEmotion: '稳定',
      forceSummary: false,
      scores: [],
      speakers: [],
    },
    speaker: {
      type: 'INTJ',
      speechType: '短句',
      finalScore: 60,
      angle: '',
    },
  };
}

test('prompt budget models existing caps without inventing earlier-turn or safety truncation', () => {
  assert.deepEqual(PROMPT_BUDGET.transcript, {
    maxMessages: 30,
    maxCharacters: 12_000,
  });
  assert.equal(PROMPT_BUDGET.relationship.maxEvidence, 3);
  assert.equal(PROMPT_BUDGET.earlierThisTurn.maxEntries, null);
  assert.equal(PROMPT_BUDGET.earlierThisTurn.maxCharacters, null);
  assert.equal(PROMPT_BUDGET.safety.maxCharacters, null);
});

test('measured prompt preserves the compatibility prompt exactly and accounts for every character', () => {
  const context = ordinaryContext();
  const measured = buildMeasuredTurnPrompt(context);

  assert.equal(measured.text, buildTurnPrompt(context));
  assert.equal(measured.measurement.total.characters, measured.text.length);
  assert.deepEqual(Object.keys(measured.measurement.sections), PROMPT_SECTIONS);
  assert.equal(
    createHash('sha256').update(measured.text).digest('hex'),
    '66e9b6a603f644b47d19ad82208b4b0e7082cbaa92523101f7278b51c7f36967',
  );
});

test('prompt measurement has fixed low-cardinality keys and never retains prompt content', () => {
  const secretUserText = 'PRIVATE-USER-BODY-9cce';
  const secretEarlierText = 'PRIVATE-EARLIER-BODY-b8a4';
  const context = ordinaryContext(secretUserText);
  context.earlierThisTurn = [{ type: 'ENFP', text: secretEarlierText }];
  context.safetyMode = 'sensitive';

  const { text, measurement } = buildMeasuredTurnPrompt(context);
  const serializedMeasurement = JSON.stringify(measurement);

  assert.match(text, new RegExp(secretUserText));
  assert.match(text, new RegExp(secretEarlierText));
  assert.doesNotMatch(serializedMeasurement, /PRIVATE-/u);
  assert.ok(measurement.sections.earlier_this_turn.characters > 0);
  assert.ok(measurement.sections.turn_safety.characters > 0);
  assert.equal(measurement.total.utf8ByteTokenProxy, measurement.total.utf8Bytes);
  assert.ok(measurement.total.utf8Bytes >= measurement.total.characters);
});

test('system prompt measurement is content-free and fully accounts for stable blocks', () => {
  const { blocks, measurement } = buildMeasuredSystemBlocks('INTJ');
  assert.equal(
    measurement.total.characters,
    blocks.reduce((sum, block) => sum + block.text.length, 0),
  );
  for (const block of blocks) {
    assert.equal(JSON.stringify(measurement).includes(block.text), false);
  }
});

test('one utterance records one system measurement across a semantic retry', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'persona16-prompt-budget-'));
  const traceFile = join(directory, 'trace.jsonl');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const responses = ['我在听。你接下来想先说哪一部分？', '我在听。'];
  let responseIndex = 0;
  const runtime: AgentRuntime = {
    async *run(): AsyncIterable<RuntimeEvent> {
      const text = responses[responseIndex++]!;
      yield { type: 'run_end', text, stopReason: 'complete' };
    },
    async abort() {},
  };
  const config: EngineConfig = {
    provider: 'anthropic',
    runtime: 'pi',
    agentModel: 'test-agent',
    directorModel: 'test-director',
    traceFile,
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

  await runTurn(
    createRoom(['INTJ']),
    '你就听我说一会儿。',
    { turnId: 'prompt-budget-retry' },
    config,
    { runtime, director: async () => directorDecision },
  );

  const measurements = readFileSync(traceFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.event === 'prompt_measurement');
  assert.equal(measurements.filter((event) => event.scope === 'system').length, 1);
  assert.equal(measurements.filter((event) => event.scope === 'turn').length, 2);
  assert.equal(JSON.stringify(measurements).includes('你就听我说一会儿。'), false);
});
