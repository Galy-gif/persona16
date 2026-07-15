import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom, DeliveryCallbackError, runRoomLoop } from '../src';
import type { AgentType, AgentUtterance, TurnPlan } from '../src/types';
import type { RoomAction, RoomController } from '../src/room/types';
import { ModelBudgetExceededError } from '../src/runtime/modelBudget';

function plan(agents: AgentType[], forceSummary = false): TurnPlan {
  return {
    scene: '决策',
    userEmotion: '稳定',
    forceSummary,
    scores: [],
    speakers: agents.map((type, index) => ({
      type,
      speechType: index === 0 ? '长发言' : '短句',
      finalScore: 80 - index,
      angle: `${type} 的独特角度`,
    })),
  };
}

function queuedController(actions: RoomAction[]): RoomController {
  let index = 0;
  return {
    async decide() {
      return actions[index++] ?? { type: 'stop', reason: 'complete' };
    },
  };
}

function utterance(type: AgentType, text: string, speechType: AgentUtterance['speechType'] = '短句'): AgentUtterance {
  return { type, text, speechType, regenerated: false };
}

test('single-agent room stops after one execution without calling the controller', async () => {
  let controllerCalls = 0;
  const result = await runRoomLoop({
    room: createRoom(['INTJ']),
    plan: plan(['INTJ']),
    controller: { async decide() { controllerCalls += 1; return { type: 'stop', reason: 'complete' }; } },
    async execute({ speaker }) { return utterance(speaker.type, '只看长期代价。', speaker.speechType); },
  });

  assert.equal(controllerCalls, 0);
  assert.equal(result.utterances.length, 1);
  assert.equal(result.report.stopReason, 'complete');
});

test('multi-agent room re-evaluates after every normal utterance', async () => {
  const controller = queuedController([
    { type: 'speak', agent: 'ENFP', speechType: '短句', angle: '补一个可能性' },
    { type: 'stop', reason: 'complete' },
  ]);
  const result = await runRoomLoop({
    room: createRoom(['INTJ', 'ENFP']),
    plan: plan(['INTJ', 'ENFP']),
    controller,
    async execute({ speaker }) {
      return speaker.type === 'INTJ'
        ? utterance('INTJ', '先计算未来三年的机会成本和现金边界。', speaker.speechType)
        : utterance('ENFP', '也给那个一直被你压下去的可能性一次小实验。', speaker.speechType);
    },
  });

  assert.deepEqual(result.utterances.map((item) => item.type), ['INTJ', 'ENFP']);
  assert.equal(result.report.controllerCalls, 2);
  assert.equal(result.report.stopReason, 'complete');
  assert.equal(result.report.actions.at(-1)?.type, 'stop');
});

test('controller keeps the original user message after the first persona reply', async () => {
  const room = createRoom(['INTJ', 'ENFP']);
  const userMessage = '我该不该辞职？';
  room.history.push({ speaker: 'user', text: userMessage });
  let controllerUserMessage: string | undefined;

  await runRoomLoop({
    room,
    plan: plan(['INTJ', 'ENFP']),
    userMessage,
    controller: {
      async decide(context) {
        controllerUserMessage = context.userMessage;
        return { type: 'stop', reason: 'complete' };
      },
    },
    async execute({ speaker }) {
      const reply = '先算清楚不可逆成本。';
      room.history.push({ speaker: speaker.type, text: reply, speechType: speaker.speechType });
      return utterance(speaker.type, reply, speaker.speechType);
    },
  });

  assert.equal(room.history.at(-1)?.speaker, 'INTJ');
  assert.equal(controllerUserMessage, userMessage);
});

test('ask_user executes one persona question and then stops', async () => {
  const result = await runRoomLoop({
    room: createRoom(['INTJ', 'ENFP']),
    plan: plan(['INTJ', 'ENFP']),
    controller: queuedController([
      { type: 'ask_user', agent: 'ENFP', question: '你最想逃离的具体事情是什么？' },
    ]),
    async execute({ speaker }) {
      return utterance(speaker.type, speaker.type === 'INTJ' ? '先别急着做结论。' : '你最想逃离的具体事情是什么？', speaker.speechType);
    },
  });

  assert.equal(result.utterances.length, 2);
  assert.equal(result.utterances[1]?.speechType, '追问');
  assert.equal(result.report.stopReason, 'needs_user_input');
});

test('summary action stops the loop and records one summary', async () => {
  const result = await runRoomLoop({
    room: createRoom(['INTJ', 'ENFP']),
    plan: plan(['INTJ', 'ENFP'], true),
    controller: queuedController([]),
    async execute({ speaker }) {
      return utterance(speaker.type, '分歧是安全边界和真实愿望；下一步先做两周实验。', speaker.speechType);
    },
  });

  assert.equal(result.report.summaryCount, 1);
  assert.equal(result.report.stopReason, 'summary_complete');
  assert.equal(result.report.controllerCalls, 0);
});

test('near-duplicate second reply stops without another controller call', async () => {
  const result = await runRoomLoop({
    room: createRoom(['INTJ', 'ENFP']),
    plan: plan(['INTJ', 'ENFP']),
    controller: queuedController([
      { type: 'speak', agent: 'ENFP', speechType: '短句', angle: '换个说法' },
    ]),
    async execute({ speaker }) {
      return speaker.type === 'INTJ'
        ? utterance('INTJ', '你真正害怕的不是辞职，而是辞职以后不知道往哪里走。')
        : utterance('ENFP', '你真正害怕的不是辞职，而是辞职以后不知道应该往哪里走。');
    },
  });

  assert.equal(result.report.duplicateDetected, true);
  assert.equal(result.report.stopReason, 'no_new_value');
  assert.equal(result.report.controllerCalls, 1);
});

test('normal-speaker budget rejects a controller attempt to continue', async () => {
  const result = await runRoomLoop({
    room: createRoom(['INTJ', 'ENFP']),
    plan: plan(['INTJ', 'ENFP']),
    budget: { maxNormalSpeakers: 1 },
    controller: queuedController([
      { type: 'speak', agent: 'ENFP', speechType: '短句', angle: '继续' },
    ]),
    async execute({ speaker }) { return utterance(speaker.type, '第一条足够长且有具体信息用于测试。'); },
  });

  assert.equal(result.utterances.length, 1);
  assert.equal(result.report.stopReason, 'budget_exhausted');
});

test('model budget exhaustion becomes a deterministic room stop', async () => {
  const result = await runRoomLoop({
    room: createRoom(['INTJ']),
    plan: plan(['INTJ']),
    controller: queuedController([]),
    async execute() { throw new ModelBudgetExceededError('tokens'); },
  });

  assert.equal(result.utterances.length, 0);
  assert.equal(result.report.stopReason, 'budget_exhausted');
  assert.deepEqual(result.report.actions.at(-1), { type: 'stop', reason: 'budget_exhausted' });
});

test('a failing action observer cannot abort the room loop', async () => {
  const failures: string[] = [];
  const result = await runRoomLoop({
    room: createRoom(['INTJ']),
    plan: plan(['INTJ']),
    controller: queuedController([]),
    onAction() { throw new Error('analytics unavailable'); },
    onObserverError(failure) { failures.push(failure.hook); },
    async execute({ speaker }) { return utterance(speaker.type, '核心发言仍然完成。'); },
  });

  assert.equal(result.utterances.length, 1);
  assert.equal(result.report.stopReason, 'complete');
  assert.deepEqual(failures, ['room_action']);
});

test('a failing action delivery sink aborts with an explicit delivery error', async () => {
  await assert.rejects(
    () => runRoomLoop({
      room: createRoom(['INTJ']),
      plan: plan(['INTJ']),
      controller: queuedController([]),
      onActionEvent() { throw new Error('stream closed'); },
      async execute({ speaker }) { return utterance(speaker.type, '不应执行到这里。'); },
    }),
    (error: unknown) => error instanceof DeliveryCallbackError && error.hook === 'room_action',
  );
});
