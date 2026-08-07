import assert from 'node:assert/strict';
import test from 'node:test';
import type { TurnEvent } from '@persona16/turn-protocol';
import { appendDurableEvent } from '../src/durableEvents';

test('durable events merge adjacent provider deltas without crossing speakers', () => {
  const events: TurnEvent[] = [];
  appendDurableEvent(events, { v: 1, turnId: 'turn-a', type: 'mutter', agent: 'INTJ', text: '这一步好像有点悬。' });
  appendDurableEvent(events, { v: 1, turnId: 'turn-a', type: 'delta', agent: 'INTJ', delta: '先' });
  appendDurableEvent(events, { v: 1, turnId: 'turn-a', type: 'delta', agent: 'INTJ', delta: '看风险' });
  appendDurableEvent(events, { v: 1, turnId: 'turn-a', type: 'speaker_end', messageId: 'message-a', agent: 'INTJ', speechType: '短句', text: '先看风险' });
  appendDurableEvent(events, { v: 1, turnId: 'turn-a', type: 'delta', agent: 'ENFP', delta: '也' });

  assert.deepEqual(events, [
    { v: 1, turnId: 'turn-a', type: 'mutter', agent: 'INTJ', text: '这一步好像有点悬。' },
    { v: 1, turnId: 'turn-a', type: 'delta', agent: 'INTJ', delta: '先看风险' },
    { v: 1, turnId: 'turn-a', type: 'speaker_end', messageId: 'message-a', agent: 'INTJ', speechType: '短句', text: '先看风险' },
    { v: 1, turnId: 'turn-a', type: 'delta', agent: 'ENFP', delta: '也' },
  ]);
});
