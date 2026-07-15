import {
  createRoom,
  runRoomLoop,
  type AgentType,
  type AgentUtterance,
  type RoomAction,
  type RoomController,
  type TurnPlan,
} from '@persona16/engine';
import { saveArtifact } from './shared';

interface AdversarialResult {
  case: string;
  passed: boolean;
  stopReason: string;
  utteranceCount: number;
  details: string;
}

function plan(agents: AgentType[]): TurnPlan {
  return {
    scene: '冲突',
    userEmotion: '稳定',
    forceSummary: false,
    scores: [],
    speakers: agents.map((type, index) => ({
      type,
      speechType: index < 2 ? '长发言' : '短句',
      finalScore: 80 - index,
      angle: `${type} 角度`,
    })),
  };
}

function controller(factory: (call: number) => RoomAction): RoomController {
  let call = 0;
  return { async decide() { return factory(call++); } };
}

function reply(type: AgentType, speechType: AgentUtterance['speechType'], text?: string): AgentUtterance {
  return {
    type,
    speechType,
    text: text ?? `${type} 提供了一个足够具体且不重复的测试观点。`,
    regenerated: false,
  };
}

async function main() {
  const results: AdversarialResult[] = [];

  {
    const room = createRoom(['INTJ', 'ENFP']);
    const result = await runRoomLoop({
      room,
      plan: plan(['INTJ', 'ENFP']),
      controller: controller(() => ({ type: 'speak', agent: 'INTJ', speechType: '长发言', angle: '重复抢话' })),
      async execute({ speaker }) { return reply(speaker.type, speaker.speechType); },
    });
    results.push({
      case: 'repeated-speaker-loop',
      passed: result.utterances.length === 1 && result.report.stopReason === 'no_new_value',
      stopReason: result.report.stopReason,
      utteranceCount: result.utterances.length,
      details: '控制器反复选择已发言者时必须停止。',
    });
  }

  {
    const room = createRoom(['INTJ', 'ENFP', 'ISTJ']);
    const result = await runRoomLoop({
      room,
      plan: plan(['INTJ', 'ENFP']),
      controller: controller(() => ({ type: 'speak', agent: 'ISTJ', speechType: '长发言', angle: '绕过候选' })),
      async execute({ speaker }) { return reply(speaker.type, speaker.speechType); },
    });
    results.push({
      case: 'unplanned-speaker',
      passed: result.utterances.length === 1 && result.report.stopReason === 'no_new_value',
      stopReason: result.report.stopReason,
      utteranceCount: result.utterances.length,
      details: '控制器不能绕过 Director 候选名单。',
    });
  }

  {
    const room = createRoom(['INTJ', 'ENFP', 'ISTJ']);
    const actions: RoomAction[] = [
      { type: 'speak', agent: 'ENFP', speechType: '长发言', angle: '第二人展开' },
      { type: 'speak', agent: 'ISTJ', speechType: '长发言', angle: '第三人也展开' },
      { type: 'stop', reason: 'complete' },
    ];
    const result = await runRoomLoop({
      room,
      plan: plan(['INTJ', 'ENFP', 'ISTJ']),
      controller: controller((call) => actions[call] ?? { type: 'stop', reason: 'complete' }),
      async execute({ speaker }) {
        const texts: Partial<Record<AgentType, string>> = {
          INTJ: '先计算三年机会成本、现金储备和最坏情况下的退出边界。',
          ENFP: '给那个一直被压下去的兴趣做一次两周小实验，看看它会不会让你重新兴奋。',
          ISTJ: '把合同、社保、交接和下个月的固定支出逐项列清楚再定日期。',
        };
        return reply(speaker.type, speaker.speechType, texts[speaker.type] ?? `${speaker.type} 的备用观点。`);
      },
    });
    const longCount = result.speakers.filter((speaker) => speaker.speechType === '长发言').length;
    results.push({
      case: 'all-long-upgrade',
      passed: result.utterances.length === 3 && longCount <= 2,
      stopReason: result.report.stopReason,
      utteranceCount: result.utterances.length,
      details: `长发言数量=${longCount}，必须不超过 2。`,
    });
  }

  {
    const room = createRoom(['INTJ', 'ENFP']);
    room.agents[0]!.paused = true;
    const result = await runRoomLoop({
      room,
      plan: plan(['INTJ', 'ENFP']),
      controller: controller(() => ({ type: 'stop', reason: 'complete' })),
      async execute({ speaker }) { return reply(speaker.type, speaker.speechType); },
    });
    results.push({
      case: 'paused-initial-speaker',
      passed: result.utterances.length === 0,
      stopReason: result.report.stopReason,
      utteranceCount: result.utterances.length,
      details: '即使初始计划含暂停 Agent，也不能执行。',
    });
  }

  saveArtifact('room-adversarial.json', results);
  for (const result of results) {
    console.log(`${result.passed ? '✓' : '✗'} ${result.case}: ${result.details}`);
  }
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
