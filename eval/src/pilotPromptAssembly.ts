import {
  GLOBAL_CONTRACT,
  SAFETY_LAYER,
  buildPilotCharacterCore,
  buildPilotSituationLens,
  getPilotCharacter,
  renderPilotTurnResponseContract,
  type AgentType,
  type PilotCharacterContextFocus,
  type PilotTurnResponseContract,
} from '@persona16/engine';

export interface PilotPromptScenarioInput {
  contextFocus: PilotCharacterContextFocus;
  responseContract: PilotTurnResponseContract;
  prompt: string;
}

export function assemblePilotScenarioPrompt(
  agent: AgentType,
  scenario: PilotPromptScenarioInput,
  relationshipContext: string,
): { system: Array<{ text: string; cache?: boolean }>; prompt: string } {
  const character = getPilotCharacter(agent);
  if (!character) throw new Error(`缺少试点人物：${agent}`);
  return {
    system: [
      { text: SAFETY_LAYER },
      { text: GLOBAL_CONTRACT },
      { text: buildPilotCharacterCore(agent), cache: true },
    ],
    prompt: `${buildPilotSituationLens(agent, scenario.contextFocus)}

${renderPilotTurnResponseContract(scenario.responseContract)}

${relationshipContext}

【当前校准场景】
${scenario.prompt}

直接以${character.name}的身份回应。不要自报人格类型，不要解释设定，不加名字前缀。只输出对用户说的话。语气用措辞、句式和标点呈现，不要把括号语气提示当成固定开场；不要用括号描述实际动作、时间流逝或物理场景，不假装有真实身体、感官、道具或共享空间。`,
  };
}
