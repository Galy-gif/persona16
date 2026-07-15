import assert from 'node:assert/strict';
import test from 'node:test';
import { createPauseAgentTool } from '../src';

test('pause_agent exposes only agent intent and keeps trusted room context out of model input', async () => {
  const tool = createPauseAgentTool(async ({ agent }) => ({
    content: `${agent} 已暂停`,
    details: { status: 'paused', agent, changed: true, roomVersion: 13 },
  }));

  assert.equal(tool.name, 'pause_agent');
  assert.deepEqual(Object.keys(tool.inputSchema.properties as object), ['agent']);
  assert.equal('roomId' in (tool.inputSchema.properties as object), false);
  assert.equal('expectedRoomVersion' in (tool.inputSchema.properties as object), false);

  const result = await tool.execute({ agent: 'INTJ' }, new AbortController().signal);
  assert.deepEqual(result.details, {
    status: 'paused', agent: 'INTJ', changed: true, roomVersion: 13,
  });
});
