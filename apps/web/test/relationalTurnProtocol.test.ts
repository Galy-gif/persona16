import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_PROMPT_VERSION, RELATIONAL_PROMPT_VERSION } from '@persona16/engine';
import {
  TURN_PROMPT_VERSION,
  turnPromptVersionForVariant,
  turnRequestSchema,
} from '../lib/server/turnProtocol';

test('production remains on the frozen baseline until relational is explicit and accepts a mutter preference', () => {
  assert.equal(TURN_PROMPT_VERSION, LEGACY_PROMPT_VERSION);
  assert.equal(turnPromptVersionForVariant('relational'), RELATIONAL_PROMPT_VERSION);
  assert.equal(turnPromptVersionForVariant('legacy'), LEGACY_PROMPT_VERSION);
  assert.equal(turnPromptVersionForVariant('unknown'), LEGACY_PROMPT_VERSION);
  const parsed = turnRequestSchema.parse({
    roomId: '2cae9d22-7ee2-42ca-a93e-7f9287e24cd0',
    turnId: 'c2571f75-a2bb-4a9a-87bd-3812ca94d44c',
    roomVersion: 1,
    command: {
      type: 'message',
      text: '今天想聊一会儿。',
      mutterEnabled: false,
    },
  });
  assert.equal(parsed.command.mutterEnabled, false);
});
