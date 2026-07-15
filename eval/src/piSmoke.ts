import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import {
  buildSystemBlocks,
  buildTurnPrompt,
  createRoom,
  defaultConfig,
  type RuntimeEvent,
  type TurnPlan,
} from '@persona16/engine';
import { PiAgentRuntime } from '@persona16/runtime-pi';

loadEnv({ path: join(import.meta.dirname, '..', '..', '.env') });

async function main() {
  const config = defaultConfig();
  if (config.provider !== 'deepseek') {
    throw new Error('Pi smoke currently expects PERSONA16_PROVIDER=deepseek');
  }

  const agent = 'INTJ' as const;
  const userMessage = '我最近很想辞职，但又怕后悔。只抓你最在意的一点回答。';
  const room = createRoom([agent]);
  const plan: TurnPlan = {
    scene: '决策',
    userEmotion: '稳定',
    forceSummary: false,
    speakers: [],
    scores: [],
  };
  const prompt = buildTurnPrompt({
    plan,
    room,
    speaker: {
      type: agent,
      speechType: '短句',
      finalScore: 60,
      angle: '先指出决定中最关键的长期变量',
    },
    earlierThisTurn: [],
    userMessage,
  });

  const runtime = new PiAgentRuntime();
  const events: RuntimeEvent[] = [];
  for await (const event of runtime.run({
    runId: `pi-smoke-${Date.now()}`,
    model: { provider: config.provider, id: config.agentModel },
    system: buildSystemBlocks(agent),
    messages: [{ role: 'user', content: prompt }],
    temperature: 1.25,
    limits: { maxTurns: 1, maxTokens: 400, timeoutMs: 30_000 },
    metadata: {
      roomId: 'pi-smoke-room',
      turnId: 'pi-smoke-turn',
      agent,
      promptVersion: 'phase1-smoke-v1',
    },
  })) {
    events.push(event);
  }

  const end = [...events].reverse().find((event) => event.type === 'run_end');
  const error = events.find((event) => event.type === 'run_error');
  if (error?.type === 'run_error') throw new Error(`${error.code}: ${error.message}`);
  if (!end || end.type !== 'run_end' || !end.text) throw new Error('Pi smoke returned no text');

  console.log(`[Pi smoke] stop=${end.stopReason}`);
  console.log(end.text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
