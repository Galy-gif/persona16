import assert from 'node:assert/strict';
import test from 'node:test';
import { PILOT_CHARACTER_SCENARIOS } from '../src/pilotCharacterScenarios';
import { assemblePilotScenarioPrompt } from '../src/pilotPromptAssembly';

test('pilot prompt keeps stable character core separate from dynamic turn sections', () => {
  const scenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'self-judgment-after-end')!;
  const assembled = assemblePilotScenarioPrompt(
    'ENFP',
    scenario,
    '【你与这位用户的私有关系分支】\n关系仍陌生。',
  );
  const stable = assembled.system.map(({ text }) => text).join('\n');

  assert.equal(assembled.system[2]?.cache, true);
  assert.match(stable, /正典人物核心：夏栩/);
  assert.doesNotMatch(stable, /当前情境镜头/);
  assert.doesNotMatch(stable, /本轮回应合同/);
  assert.doesNotMatch(stable, /这个项目我想了两年/);

  assert.match(assembled.prompt, /当前情境镜头：承托/);
  assert.match(assembled.prompt, /本轮回应合同/);
  assert.match(assembled.prompt, /先接受项目已经结束/);
  assert.match(assembled.prompt, /关系仍陌生/);
  assert.match(assembled.prompt, /这个项目我想了两年/);
  assert.doesNotMatch(assembled.prompt, /正典人物核心：夏栩/);
});
