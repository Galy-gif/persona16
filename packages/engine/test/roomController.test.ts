import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoomControllerAction } from '../src';

test('room controller stop uses a narrow action-specific contract', () => {
  assert.deepEqual(
    parseRoomControllerAction({ action: 'stop', reason: 'no_new_value' }, ['INTJ', 'ENFP']),
    { type: 'stop', reason: 'no_new_value' },
  );

  assert.throws(() => parseRoomControllerAction({
    action: 'stop',
    reason: 'complete',
    agent: 'INTJ',
    speechType: '短句',
    angle: '',
    question: '',
  }, ['INTJ', 'ENFP']));
});
