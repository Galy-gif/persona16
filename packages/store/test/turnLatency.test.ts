import assert from 'node:assert/strict';
import test from 'node:test';
import { recordTurnPersistence } from '../src/turnLatency';

test('turn persistence augments V2 latency without changing legacy records', () => {
  const v2 = {
    usage: {},
    latency: {
      schemaVersion: 2,
      totalMs: 20,
      validatedOutputMs: 15,
      firstTokenMs: 15,
      stagesMs: { safety: 2 },
      counts: {},
    },
    trace: {},
  };
  recordTurnPersistence(v2, 7);
  assert.deepEqual(v2.latency.stagesMs, { safety: 2, turn_persistence: 7 });
  assert.equal(v2.latency.totalMs, 27);
  recordTurnPersistence(v2, 3);
  assert.deepEqual(v2.latency.stagesMs, { safety: 2, turn_persistence: 10 });
  assert.equal(v2.latency.totalMs, 30);

  const legacy = { usage: {}, latency: { totalMs: 20, firstTokenMs: 15 }, trace: {} };
  recordTurnPersistence(legacy, 7);
  assert.deepEqual(legacy.latency, { totalMs: 20, firstTokenMs: 15 });
});
