import assert from 'node:assert/strict';
import test from 'node:test';
import type { PersistedTurnEvent } from '@persona16/store';
import { appendPersistedTurnEvent } from '../lib/server/turnPersistence';

test('durable turn events merge adjacent provider deltas without crossing speakers', () => {
  const events: PersistedTurnEvent[] = [];
  appendPersistedTurnEvent(events, { v: 1, turnId: 'turn-a', type: 'delta', agent: 'INTJ', delta: '先' });
  appendPersistedTurnEvent(events, { v: 1, turnId: 'turn-a', type: 'delta', agent: 'INTJ', delta: '看风险' });
  appendPersistedTurnEvent(events, { v: 1, turnId: 'turn-a', type: 'speaker_end', messageId: 'message-a', agent: 'INTJ', speechType: '短句', text: '先看风险' });
  appendPersistedTurnEvent(events, { v: 1, turnId: 'turn-a', type: 'delta', agent: 'ENFP', delta: '也' });

  assert.deepEqual(events, [
    { v: 1, turnId: 'turn-a', type: 'delta', agent: 'INTJ', delta: '先看风险' },
    { v: 1, turnId: 'turn-a', type: 'speaker_end', messageId: 'message-a', agent: 'INTJ', speechType: '短句', text: '先看风险' },
    { v: 1, turnId: 'turn-a', type: 'delta', agent: 'ENFP', delta: '也' },
  ]);
});
