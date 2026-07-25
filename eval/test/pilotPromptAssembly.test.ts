import assert from 'node:assert/strict';
import test from 'node:test';
import { PILOT_CHARACTER_SCENARIOS } from '../src/pilotCharacterScenarios';
import {
  assemblePilotScenarioPrompt,
  buildPilotRetryPrompt,
} from '../src/pilotPromptAssembly';
import { compileSemanticTurnControl } from '../../packages/engine/src/semanticTurnControl';

test('pilot prompt keeps stable character core separate from dynamic turn sections', () => {
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
  assert.match(stable, /正典人物核心：夏栩/);
  assert.doesNotMatch(stable, /当前情境镜头/);
  assert.doesNotMatch(stable, /本轮回应合同/);
  assert.doesNotMatch(stable, /这个项目我想了两年/);

  assert.match(assembled.prompt, /当前情境镜头：承托/);
  assert.match(assembled.prompt, /本轮回应合同/);
  assert.match(assembled.prompt, /本轮已批准动作计划/);
  assert.match(assembled.prompt, /方向性问题预算：1/);
  assert.match(assembled.prompt, /禁止动作：.*ask_binary.*reopen_decision/);
  assert.match(assembled.prompt, /先接受项目已经结束/);
  assert.match(assembled.prompt, /关系仍陌生/);
  assert.match(assembled.prompt, /这个项目我想了两年/);
  assert.match(assembled.prompt, /语气用措辞、句式和标点呈现/);
  assert.doesNotMatch(assembled.prompt, /“（小声）”等文字语气标记.*可以使用/);
  assert.doesNotMatch(assembled.prompt, /正典人物核心：夏栩/);
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
