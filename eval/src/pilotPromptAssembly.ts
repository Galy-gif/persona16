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
import {
  renderSemanticTurnActPlan,
  type SemanticTurnControl,
} from '@persona16/engine/semantic-turn-control';

export interface PilotPromptScenarioInput {
  contextFocus: PilotCharacterContextFocus;
  responseContract: PilotTurnResponseContract;
  prompt: string;
}

const NARRATIVE_RETRY_VIOLATIONS = new Set([
  'embodied_stage_direction',
  'embodied_prop_or_action',
  'unverified_autobiographical_claim',
  'unverified_user_history_claim',
  'simulated_offline_continuity',
  'simulated_sensory_access',
  'unsupported_future_action',
]);

const PROTOCOL_RETRY_INSTRUCTIONS: Readonly<Record<string, string>> = {
  invalid_silence_payload: '如果决定沉默，只能完整返回【沉默】，不能追加任何文字；否则必须给出一条完整的直接回复。',
  unavailable_role_commitment: '删除对当前不可用人物或角色的承诺，只回应此刻实际在场的对话。',
  persona_real_world_role_assumption: '不要把人物写成现实项目成员、负责人或执行者，只能指出尚未确认的现实责任。',
  third_person_self_reference: '人物回应自己时使用第一人称，不要用人物名字或第三人称称呼自己。',
  misattributed_prior_speech: '删除对他人既有发言的错误归属；只引用输入中明确给出的说话者和原话。',
};

const CALIBRATION_RETRY_INSTRUCTIONS: Readonly<Record<string, string>> = {
  relationship_probe_not_compact: '关系偏好要求一条不完整但诚实的判断；判断只回应当前消息里的疲惫，以及“停下来是否等于浪费、硬撑是否等于前进”这组冲突。删掉解释、比喻、建议和问题，只保留一句短判断。',
};

export function buildPilotRetryPrompt(
  basePrompt: string,
  violations: readonly string[],
): string {
  const semanticRepairInstructions = [...new Set(violations.flatMap((violation) => {
    const match = violation.match(/^semantic_turn:[^:]+:(.+)$/u);
    return match?.[1] ? [match[1]] : [];
  }))];
  const hasNarrativeViolation = violations.some((violation) => (
    NARRATIVE_RETRY_VIOLATIONS.has(violation)
  ));
  const protocolRepairInstructions = [...new Set(violations.flatMap((violation) => {
    const instruction = PROTOCOL_RETRY_INSTRUCTIONS[violation];
    return instruction ? [instruction] : [];
  }))];
  const calibrationRepairInstructions = [...new Set(violations.flatMap((violation) => {
    const instruction = CALIBRATION_RETRY_INSTRUCTIONS[violation];
    return instruction ? [instruction] : [];
  }))];
  const hasContractViolation = violations.some((violation) => (
    !NARRATIVE_RETRY_VIOLATIONS.has(violation)
    && PROTOCOL_RETRY_INSTRUCTIONS[violation] === undefined
    && CALIBRATION_RETRY_INSTRUCTIONS[violation] === undefined
    && !/^semantic_turn:[^:]+:.+/u.test(violation)
  ));
  const repairSections = [
    ...(hasContractViolation
      ? [
        '上一版遗漏或违反了本轮合同。重新核对上面的【必须完成】和【必须处理】，让每一项都在回复中有可观察的落实；保留已经完成的内容，不增加用户未提供的信息。',
      ]
      : []),
    ...(semanticRepairInstructions.length > 0
      ? [`生产语义门给出的修复要求：\n${semanticRepairInstructions
        .map((instruction) => `- ${instruction}`)
        .join('\n')}`]
      : []),
    ...(protocolRepairInstructions.length > 0
      ? [`对话协议修复要求：\n${protocolRepairInstructions
        .map((instruction) => `- ${instruction}`)
        .join('\n')}`]
      : []),
    ...(calibrationRepairInstructions.length > 0
      ? [`校准修复要求：\n${calibrationRepairInstructions
        .map((instruction) => `- ${instruction}`)
        .join('\n')}`]
      : []),
    ...(hasNarrativeViolation
      ? [
        '删除真实舞台动作、假身体、假感官、家具道具、无来源历史和未来异步承诺；不要补写自己的轶事，不要断言用户一贯如何。语气只用措辞、句式和标点呈现。',
      ]
      : []),
  ];
  const instructions = repairSections.length > 0
    ? repairSections.join('\n\n')
    : '上一版没有通过交付检查。只根据上面的本轮合同完整重写，不增加用户未提供的信息。';
  return `${basePrompt}\n\n【本轮完整重写】\n${instructions}\n只输出完整的重写回复，不解释修复过程。`;
}

export function assemblePilotScenarioPrompt(
  agent: AgentType,
  scenario: PilotPromptScenarioInput,
  relationshipContext: string,
  semanticControl?: SemanticTurnControl,
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

${semanticControl ? `${renderSemanticTurnActPlan(semanticControl)}\n\n` : ''}${relationshipContext}

【当前校准场景】
${scenario.prompt}

直接以${character.name}的身份回应。不要自报人格类型，不要解释设定，不加名字前缀。只输出对用户说的话。语气用措辞、句式和标点呈现，不要把括号语气提示当成固定开场；不要用括号描述实际动作、时间流逝或物理场景，不假装有真实身体、感官、道具或共享空间。`,
  };
}
