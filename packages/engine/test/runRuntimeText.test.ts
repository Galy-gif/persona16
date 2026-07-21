import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeExecutionError, runRuntimeText } from '../src';
import type { AgentRuntime, RuntimeEvent, RuntimeRequest, RuntimeStopReason } from '../src';

const request: RuntimeRequest = {
  runId: 'runtime-text-test',
  model: { provider: 'test', id: 'test' },
  system: [],
  messages: [{ role: 'user', content: '说一句话' }],
  limits: { maxTurns: 1, maxTokens: 100, timeoutMs: 1_000 },
  metadata: { roomId: 'room', turnId: 'turn', agent: 'INTJ', promptVersion: 'test' },
};

function stoppedRuntime(stopReason: RuntimeStopReason): AgentRuntime {
  return {
    async *run(): AsyncIterable<RuntimeEvent> {
      yield { type: 'text_delta', delta: '只生成了半句' };
      yield { type: 'run_end', text: '只生成了半句', stopReason };
    },
    async abort() {},
  };
}

test('non-complete runtime stops never become successful partial replies', async () => {
  for (const reason of ['aborted', 'timeout', 'max_tokens', 'max_turns'] as const) {
    await assert.rejects(
      runRuntimeText(stoppedRuntime(reason), { ...request, runId: `runtime-${reason}` }),
      new RegExp(`runtime stopped: ${reason}`),
    );
  }
});

test('runtime errors preserve code, recoverability, terminal reason, and partial-text state', async () => {
  const runtime: AgentRuntime = {
    async *run(): AsyncIterable<RuntimeEvent> {
      yield { type: 'text_delta', delta: '只生成了半句' };
      yield { type: 'run_error', code: 'provider_overloaded', message: '稍后再试', recoverable: true };
      yield { type: 'run_end', text: '只生成了半句', stopReason: 'error' };
    },
    async abort() {},
  };

  await assert.rejects(
    runRuntimeText(runtime, request),
    (error: unknown) => error instanceof RuntimeExecutionError
      && error.code === 'provider_overloaded'
      && error.recoverable
      && error.stopReason === 'error'
      && error.hadPartialText,
  );
});

test('runtime stream without a terminal event never becomes a successful partial reply', async () => {
  const runtime: AgentRuntime = {
    async *run(): AsyncIterable<RuntimeEvent> {
      yield { type: 'text_delta', delta: '没有终态的半句' };
    },
    async abort() {},
  };

  await assert.rejects(
    runRuntimeText(runtime, request),
    (error: unknown) => error instanceof RuntimeExecutionError
      && error.code === 'runtime_missing_terminal'
      && error.hadPartialText,
  );
});
