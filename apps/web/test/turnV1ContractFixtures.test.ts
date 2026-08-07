import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { TurnEvent, TurnStreamEvent } from '@persona16/turn-protocol';

const CONTRACT_DIRECTORY = fileURLToPath(
  new URL('../../../contracts/turn-v1/', import.meta.url),
);
const SYNTHETIC_ID_PREFIX = '00000000-0000-4000-8000-';
const NDJSON_FIXTURES = [
  'normal-single.ndjson',
  'normal-room.ndjson',
  'safety.ndjson',
  'known-failure.ndjson',
  'unknown-result.ndjson',
  'unknown-error.ndjson',
] as const;
const JSON_FIXTURES = [
  'manifest.json',
  'room.json',
  'memories.json',
  'feedback.json',
] as const;
const TURN_EVENT_TYPES = new Set([
  'turn_start',
  'plan',
  'room_action',
  'speaker_start',
  'delta',
  'speaker_end',
  'safety_notice',
  'memory_candidate',
  'turn_end',
  'done',
  'error',
]);

type FixtureEvent = TurnEvent;
type DoneEvent = Extract<TurnEvent, { type: 'done' }>;
type ErrorEvent = Extract<TurnStreamEvent, { type: 'error' }>;

interface FixtureManifest {
  schemaVersion: 1;
  dataClassification: 'synthetic-only';
  currentRouteEmitsPlan: false;
  declaredEngineEvents: string[];
  streamTerminalEvents: ['done', 'error'];
  trustedSuccessTerminal: 'done';
  trustedErrorOutcomes: ['known_failed'];
  unknownResultFixtures: ['unknown-result.ndjson', 'unknown-error.ndjson'];
}

function readFixture(name: string): string {
  return readFileSync(`${CONTRACT_DIRECTORY}${name}`, 'utf8');
}

function parseNdjson(name: string): FixtureEvent[] {
  return readFixture(name)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      assert.equal(parsed.v, 1, `${name}:${index + 1} must use Turn event v1`);
      assert.equal(typeof parsed.turnId, 'string', `${name}:${index + 1} must include turnId`);
      assert.equal(typeof parsed.type, 'string', `${name}:${index + 1} must include type`);
      assert.ok(TURN_EVENT_TYPES.has(parsed.type as string), `${name}:${index + 1} has an unknown event type`);
      return parsed as unknown as FixtureEvent;
    });
}

function trustedOutcome(events: FixtureEvent[]): 'done' | 'error' | 'unknown' {
  const terminal = events.findLast((event) => event.type === 'done' || event.type === 'error');
  if (terminal?.type === 'done') return 'done';
  if (terminal?.type === 'error' && terminal.outcome === 'known_failed') return 'error';
  return 'unknown';
}

function collectIdValues(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectIdValues(item, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  for (const [key, item] of Object.entries(value)) {
    if (/(?:^id$|Id$)/u.test(key) && typeof item === 'string') result.push(item);
    collectIdValues(item, result);
  }
  return result;
}

test('turn v1 manifest owns the cross-language event boundary without changing current Route behavior', () => {
  const manifest = JSON.parse(readFixture('manifest.json')) as FixtureManifest;
  const declaredPlan: Extract<TurnStreamEvent, { type: 'plan' }> = {
    v: 1,
    turnId: `${SYNTHETIC_ID_PREFIX}000000000099`,
    type: 'plan',
    scene: '闲聊',
    userEmotion: '稳定',
  };
  const harnessDone: DoneEvent['type'] = 'done';

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.dataClassification, 'synthetic-only');
  assert.equal(manifest.currentRouteEmitsPlan, false);
  assert.deepEqual(manifest.declaredEngineEvents, [
    'turn_start', 'plan', 'room_action', 'speaker_start', 'delta',
    'speaker_end', 'safety_notice', 'memory_candidate', 'turn_end', 'error',
  ]);
  assert.deepEqual(manifest.streamTerminalEvents, ['done', 'error']);
  assert.equal(manifest.trustedSuccessTerminal, 'done');
  assert.deepEqual(manifest.trustedErrorOutcomes, ['known_failed']);
  assert.deepEqual(
    manifest.unknownResultFixtures,
    ['unknown-result.ndjson', 'unknown-error.ndjson'],
  );
  assert.equal(declaredPlan.type, 'plan');
  assert.equal(harnessDone, 'done');
});

test('NDJSON fixtures preserve v1 ordering and distinguish stream end from trusted outcome', () => {
  const expectedTypes: Record<(typeof NDJSON_FIXTURES)[number], string[]> = {
    'normal-single.ndjson': [
      'turn_start', 'room_action', 'speaker_start', 'delta', 'speaker_end',
      'memory_candidate', 'turn_end', 'done',
    ],
    'normal-room.ndjson': [
      'turn_start', 'room_action', 'speaker_start', 'delta', 'speaker_end',
      'room_action', 'speaker_start', 'delta', 'speaker_end', 'room_action',
      'turn_end', 'done',
    ],
    'safety.ndjson': ['turn_start', 'safety_notice', 'turn_end', 'done'],
    'known-failure.ndjson': ['turn_start', 'error'],
    'unknown-result.ndjson': ['turn_start', 'room_action', 'speaker_start', 'delta'],
    'unknown-error.ndjson': ['turn_start', 'delta', 'error'],
  };

  for (const name of NDJSON_FIXTURES) {
    const events = parseNdjson(name);
    assert.deepEqual(events.map((event) => event.type), expectedTypes[name], name);
    assert.equal(events[0]?.type, 'turn_start', `${name} must start with turn_start`);
    assert.equal(new Set(events.map((event) => event.turnId)).size, 1, `${name} must keep one turnId`);
    const terminals = events.filter((event) => event.type === 'done' || event.type === 'error');
    if (name === 'unknown-result.ndjson' || name === 'unknown-error.ndjson') {
      assert.equal(terminals.length, name === 'unknown-error.ndjson' ? 1 : 0);
      assert.equal(trustedOutcome(events), 'unknown');
      continue;
    }
    assert.equal(terminals.length, 1, `${name} must contain exactly one trusted terminal`);
    assert.equal(events.at(-1)?.type, terminals[0]?.type, `${name} terminal must be last`);
  }
});

test('done is the Harness persisted terminal and error carries an explicit recovery outcome', () => {
  for (const name of ['normal-single.ndjson', 'normal-room.ndjson', 'safety.ndjson'] as const) {
    const events = parseNdjson(name);
    const turnEnd = events.at(-2);
    const done = events.at(-1);
    assert.equal(turnEnd?.type, 'turn_end');
    assert.equal(done?.type, 'done');
    if (turnEnd?.type === 'turn_end' && done?.type === 'done') {
      assert.equal(done.roomVersion, turnEnd.roomVersion);
      assert.ok(done.room.history.length > 0);
    }
    assert.equal(trustedOutcome(events), 'done');
  }

  const failure = parseNdjson('known-failure.ndjson').at(-1) as ErrorEvent;
  assert.equal(failure.type, 'error');
  assert.equal(failure.outcome, 'known_failed');
  assert.equal(failure.recoveryAction, 'retry');
  assert.equal(trustedOutcome(parseNdjson('known-failure.ndjson')), 'error');

  const unknownFailure = parseNdjson('unknown-error.ndjson').at(-1) as ErrorEvent;
  assert.equal(unknownFailure.type, 'error');
  assert.equal(unknownFailure.outcome, 'unknown');
  assert.equal(unknownFailure.recoveryAction, 'refresh');
  assert.equal(trustedOutcome(parseNdjson('unknown-error.ndjson')), 'unknown');
});

test('room, memory, and feedback response fixtures expose the current client contract', () => {
  const room = JSON.parse(readFixture('room.json')) as {
    id: string;
    version: number;
    busy: boolean;
    state: { agents: unknown[]; history: unknown[] };
  };
  const memories = JSON.parse(readFixture('memories.json')) as {
    memories: Array<{ status: string; sourceTurnId: string }>;
  };
  const feedback = JSON.parse(readFixture('feedback.json')) as {
    feedback: Array<{ rating: string; tags: string[]; messageId: string }>;
  };

  assert.equal(room.version, 2);
  assert.equal(room.busy, false);
  assert.ok(room.state.agents.length > 0);
  assert.ok(room.state.history.length > 0);
  assert.deepEqual(memories.memories.map((memory) => memory.status), ['candidate', 'confirmed']);
  assert.ok(memories.memories.every((memory) => memory.sourceTurnId.startsWith(SYNTHETIC_ID_PREFIX)));
  assert.deepEqual(feedback.feedback.map((item) => item.rating), ['positive', 'negative']);
  assert.deepEqual(feedback.feedback[1]?.tags, ['too_long']);
});

test('all contract fixtures contain only synthetic identifiers and no credential-shaped or personal data', () => {
  const parsedFixtures: unknown[] = [];
  const rawFixtures: string[] = [];
  for (const name of NDJSON_FIXTURES) {
    const raw = readFixture(name);
    rawFixtures.push(raw);
    parsedFixtures.push(...parseNdjson(name));
  }
  for (const name of JSON_FIXTURES) {
    const raw = readFixture(name);
    rawFixtures.push(raw);
    parsedFixtures.push(JSON.parse(raw));
  }

  const identifiers = parsedFixtures.flatMap((fixture) => collectIdValues(fixture));
  assert.ok(identifiers.length > 0);
  assert.ok(identifiers.every((identifier) => identifier.startsWith(SYNTHETIC_ID_PREFIX)));
  const corpus = rawFixtures.join('\n');
  assert.doesNotMatch(corpus, /(?:api[_-]?key|authorization|bearer|password|session[_-]?secret|set-cookie)/iu);
  assert.doesNotMatch(corpus, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  assert.doesNotMatch(corpus, /(?<!\d)1[3-9]\d{9}(?!\d)/u);
});
