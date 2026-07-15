import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { defineRuntimeTool } from '../src';

test('defineRuntimeTool derives model schema and validates before typed execution', async () => {
  let executedAgent: string | undefined;
  const tool = defineRuntimeTool({
    name: 'test_agent_action',
    description: '测试窄工具合同。',
    schema: z.object({ agent: z.enum(['INTJ', 'ENFP']) }).strict(),
    async execute(input) {
      executedAgent = input.agent;
      return { content: 'ok', details: { status: 'ok' as const, agent: input.agent } };
    },
  });

  const agentSchema = (tool.inputSchema.properties as Record<string, { enum?: string[] }>).agent;
  assert.deepEqual(agentSchema?.enum, ['INTJ', 'ENFP']);

  const result = await tool.execute({ agent: 'INTJ' }, new AbortController().signal);
  assert.equal(executedAgent, 'INTJ');
  assert.deepEqual(result.details, { status: 'ok', agent: 'INTJ' });

  await assert.rejects(
    tool.execute({ agent: 'ENFP', roomId: 'model-must-not-choose-room' }, new AbortController().signal),
    /Unrecognized key/,
  );
});
