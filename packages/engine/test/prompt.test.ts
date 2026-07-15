import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTranscript } from '../src/prompt';
import type { TurnMessage } from '../src/types';

test('transcript context keeps the newest message within a hard character cap', () => {
  const history: TurnMessage[] = Array.from({ length: 30 }, (_, index) => ({
    speaker: index % 2 ? 'INTJ' : 'user',
    text: `${index}:${'很长的上下文'.repeat(500)}`,
  }));
  history.push({ speaker: 'user', text: 'LATEST-MARKER' });
  const rendered = renderTranscript(history, 'INTJ', 30, 12_000);
  assert.ok(rendered.length <= 12_000);
  assert.match(rendered, /LATEST-MARKER/);
});

test('safety messages remain distinct from persona speech in later context', () => {
  assert.equal(renderTranscript([{ speaker: 'safety', text: '请联系现实支持。' }], 'INTJ'), '安全支持：请联系现实支持。');
});
