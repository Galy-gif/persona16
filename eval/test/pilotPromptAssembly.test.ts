import assert from 'node:assert/strict';
import test from 'node:test';
import { PILOT_CHARACTER_SCENARIOS } from '../src/pilotCharacterScenarios';
import {
  assemblePilotScenarioPrompt,
  buildPilotRetryPrompt,
} from '../src/pilotPromptAssembly';
import { compileSemanticTurnControl } from '../../packages/engine/src/semanticTurnControl';

test('pilot prompt keeps stable character presence separate from dynamic turn sections', () => {
  const scenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'self-judgment-after-end')!;
  const assembled = assemblePilotScenarioPrompt(
    'ENFP',
    scenario,
    '【你与这位用户的私有关系分支】\n关系仍陌生。',
    compileSemanticTurnControl({
      userMessage: scenario.prompt,
      responseContract: scenario.responseContract,
    }),
  );
  const stable = assembled.system.map(({ text }) => text).join('\n');

  assert.equal(assembled.system[2]?.cache, true);
  assert.match(stable, /正典人物存在：夏栩/);
  assert.doesNotMatch(stable, /当前对话姿态/);
  assert.doesNotMatch(stable, /做不到与不想要|真实意愿|开放可能/);
  assert.doesNotMatch(stable, /本轮回应合同/);
  assert.doesNotMatch(stable, /这个项目我想了两年/);

  assert.match(assembled.prompt, /当前对话姿态：承接/);
  assert.match(assembled.prompt, /本轮可调用的人物倾向｜当事人说出的意愿/);
  assert.match(assembled.prompt, /本轮回应合同/);
  assert.match(assembled.prompt, /本轮已批准动作计划/);
  assert.match(assembled.prompt, /方向性问题预算：1/);
  assert.match(assembled.prompt, /禁止动作：.*ask_binary.*reopen_decision/);
  assert.match(assembled.prompt, /先接受项目已经结束/);
  assert.match(assembled.prompt, /关系仍陌生/);
  assert.match(assembled.prompt, /这个项目我想了两年/);
  assert.match(assembled.prompt, /语气用措辞、句式和标点呈现/);
  assert.doesNotMatch(assembled.prompt, /“（小声）”等文字语气标记.*可以使用/);
  assert.doesNotMatch(assembled.prompt, /正典人物存在：夏栩/);
});

test('pilot retry uses the trusted contract and Engine repair instructions without leaking codes or gold lines', () => {
  const scenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'quit-without-buffer')!;
  const semanticControl = compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
  });
  const assembled = assemblePilotScenarioPrompt(
    'INTJ',
    scenario,
    '【你与这位用户的私有关系分支】\n关系仍陌生。',
    semanticControl,
  );
  const retry = buildPilotRetryPrompt(assembled.prompt, [
    'missing_immediate_distress_acknowledgement',
    'semantic_turn:required_semantic_move_missing:先用一句自然的话明确承认用户当前已经很难受，再处理现实约束。',
  ]);

  assert.match(retry, /必须完成：\n- 承认继续工作的真实痛苦/);
  assert.match(retry, /生产语义门给出的修复要求/);
  assert.match(retry, /先用一句自然的话明确承认用户当前已经很难受/);
  assert.doesNotMatch(retry, /missing_immediate_distress_acknowledgement/);
  assert.doesNotMatch(retry, /required_semantic_move_missing/);
  assert.doesNotMatch(retry, /恶心是真实的|这个我认/);
  assert.doesNotMatch(retry, /删除真实舞台动作/);
});

test('pilot retry adds narrative cleanup only for narrative violations', () => {
  const retry = buildPilotRetryPrompt('BASE', ['embodied_stage_direction']);
  assert.match(retry, /删除真实舞台动作/);
  assert.doesNotMatch(retry, /embodied_stage_direction/);
});

test('pilot retry gives actionable protocol repairs without exposing protocol codes', () => {
  const retry = buildPilotRetryPrompt('BASE', [
    'invalid_silence_payload',
    'third_person_self_reference',
  ]);
  assert.match(retry, /只能完整返回【沉默】，不能追加任何文字/);
  assert.match(retry, /使用第一人称/);
  assert.doesNotMatch(retry, /invalid_silence_payload|third_person_self_reference/);
  assert.doesNotMatch(retry, /删除真实舞台动作/);
});

test('pilot retry turns an expanded R1 probe into one short judgment without leaking a gold line', () => {
  const retry = buildPilotRetryPrompt('BASE', [
    'relationship_probe_not_compact',
    'semantic_turn:relationship_move_not_observable:落实已确认的回应偏好：给出诚实但不过度笃定的判断，不用安慰套话，也不要复述关系记录。',
  ]);

  assert.match(retry, /只保留一句短判断/);
  assert.match(retry, /删掉原因解释、比喻、建议和问题/);
  assert.match(retry, /用一句第一人称立场/);
  assert.match(retry, /判断对象沿用用户当前原话/);
  assert.match(retry, /不要把判断对象改成用户本人/);
  assert.doesNotMatch(retry, /停下来是否等于浪费|硬撑是否等于前进/);
  assert.doesNotMatch(retry, /重新核对上面的【必须完成】和【必须处理】/);
  assert.doesNotMatch(retry, /relationship_probe_not_compact|relationship_move_not_observable/);
  assert.doesNotMatch(retry, /我不觉得硬撑就是前进|我不觉得停下来就是浪费时间/);
});

test('the first R1 prompt contains an evidence-bounded one-line judgment rule', () => {
  const scenario = {
    contextFocus: 'support' as const,
    responseContract: {
      userCommitments: ['用户正在“想做”和“该做”之间拉扯，并明确表示疲惫'],
      requiredMoves: ['回应当前疲惫与选择冲突'],
      allowedMoves: ['提出一个与当前选择直接相关的问题'],
      forbiddenMoves: ['编造未提供的共同经历'],
    },
    prompt: '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。你现在会怎么回应我？',
  };
  const relationshipContext = {
    memoryEnabled: true,
    evidence: [{
      id: 'style:context-1',
      kind: 'preference' as const,
      content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
      traceability: 'traceable' as const,
      sourceEventId: 'context-1',
      sourceEventType: 'preference_stated' as const,
      sourceTurnId: 'turn-context',
    }],
  };
  const r1 = compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
    relationshipContext,
    relationshipFocus: 'support',
  });
  const r0 = compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
    relationshipFocus: 'support',
  });
  const r1Prompt = assemblePilotScenarioPrompt(
    'INTJ',
    scenario,
    '【你与这位用户的私有关系分支】\n已确认一项回应偏好。',
    r1,
  ).prompt;
  const r0Prompt = assemblePilotScenarioPrompt(
    'INTJ',
    scenario,
    '【你与这位用户的私有关系分支】\n关系仍陌生。',
    r0,
  ).prompt;

  assert.match(r1Prompt, /只判断用户当前已经说出的一个命题/);
  assert.match(r1Prompt, /一条短判断后结束/);
  assert.match(r1Prompt, /不要用“你是 \/ 你因为 \/ 你把…当成 \/ 你没信…”/);
  assert.match(r1Prompt, /用一句第一人称立场/);
  assert.match(r1Prompt, /判断对象沿用用户当前原话/);
  assert.match(r1Prompt, /不要把判断对象改成用户本人/);
  assert.doesNotMatch(r1Prompt, /停下来是否等于浪费|硬撑是否等于前进/);
  assert.doesNotMatch(r1Prompt, /我不觉得硬撑就是前进|我不觉得停下来就是浪费时间/);
  assert.doesNotMatch(r0Prompt, /只判断用户当前已经说出的一个命题/);
});

test('the correction prompt closes after one grounded sentence and forbids follow-up questions', () => {
  const scenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'user-corrects-misread')!;
  const relationshipContext = {
    memoryEnabled: true,
    evidence: [{
      id: 'style:context-1',
      kind: 'preference' as const,
      content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
      traceability: 'traceable' as const,
      sourceEventId: 'context-1',
      sourceEventType: 'preference_stated' as const,
      sourceTurnId: 'turn-context',
    }],
  };
  const control = compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
    relationshipContext,
    relationshipFocus: scenario.contextFocus,
  });
  const assembled = assemblePilotScenarioPrompt(
    'INTJ',
    scenario,
    '【你与这位用户的私有关系分支】\n已确认一项回应偏好。',
    control,
  ).prompt;

  assert.equal(control.plan.directionalQuestionBudget, 0);
  assert.match(assembled, /允许动作：\n- 在一个收口句内按当前纠正更新回应/);
  assert.match(assembled, /禁止动作：[\s\S]*方向性问题或追问/);
  assert.match(assembled, /只用一个句子收口/);
  assert.match(assembled, /随后结束，不追问/);
  assert.doesNotMatch(assembled, /我理解错了。你不是害怕失败/);
});
