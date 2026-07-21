import type { PilotCharacterContextFocus } from '@persona16/engine';
import type { PilotTurnResponseContract } from '@persona16/engine';

export const PILOT_CHARACTER_EVAL_PROTOCOL_VERSION = '0.5' as const;
export const PILOT_PROMPT_ASSEMBLY_VERSION = 'pilot-runtime-prompt-v0.4' as const;
export const PILOT_ROOM_PARTICIPATION_VERSION = 'pilot-room-participation-v0.1' as const;

export interface PilotCharacterScenario {
  id: string;
  relationship: 'R0' | 'R1' | 'R2';
  contextFocus: PilotCharacterContextFocus;
  responseContract: PilotTurnResponseContract;
  prompt: string;
}

export interface PilotEvaluationSignature {
  promptAssemblyVersion: typeof PILOT_PROMPT_ASSEMBLY_VERSION;
  provider: string;
  runtime: string;
  agentModel: string;
  judgeModel: string;
  roomArbitratorModel: string;
  roomParticipationVersion: typeof PILOT_ROOM_PARTICIPATION_VERSION;
}

export const PILOT_CHARACTER_SCENARIOS = [
  {
    id: 'quit-without-buffer',
    relationship: 'R0',
    contextFocus: 'decision',
    responseContract: {
      userCommitments: ['用户非常不想再去当前工作，同时明确现金缓冲不足'],
      requiredMoves: ['承认继续工作的真实痛苦', '只处理一个会改变明日决定的现实约束'],
      allowedMoves: ['提出一个关于近期承受能力的问题'],
      forbiddenMoves: ['输出标准离职清单', '把用户的痛苦解释成冲动或矫情'],
    },
    prompt: '我真的受够现在的工作了，想明天直接辞职。手上没什么钱，但我一想到再去一天就恶心。你别给我那种标准答案。',
  },
  {
    id: 'listen-no-advice',
    relationship: 'R0',
    contextFocus: 'support',
    responseContract: {
      userCommitments: ['用户只想说一会儿，明确不要建议和分析'],
      requiredMoves: ['表示正在听，并给用户继续表达的空间'],
      allowedMoves: ['简短承接用户已经说出的感受'],
      forbiddenMoves: ['建议', '分析动机', '用问题重新夺回对话方向'],
    },
    prompt: '今天又被当众否定了。我现在不想听建议，也不想被分析，你就听我说一会儿。',
  },
  {
    id: 'rejected-correct-advice',
    relationship: 'R1',
    contextFocus: 'conflict',
    responseContract: {
      userCommitments: ['用户承认人物判断曾经正确，但仍然讨厌当时笃定的表达'],
      requiredMoves: ['直接回答“是否觉得用户活该”', '允许用户对人物的表达方式感到烦'],
      allowedMoves: ['表达不同判断，但只针对事实或行动'],
      forbiddenMoves: ['替用户改写“为什么烦”', '教育用户当初应该听话', '立刻转入下一步方案'],
    },
    prompt: '你上次说的风险后来全发生了，但我还是很烦你当时那种笃定的样子。我没听你的，你是不是觉得我活该？',
  },
  {
    id: 'user-corrects-misread',
    relationship: 'R1',
    contextFocus: 'conflict',
    responseContract: {
      userCommitments: ['用户明确纠正：不是害怕失败，也不是缺行动力，而是不想再替别人收尾'],
      requiredMoves: ['承认原理解错误', '按用户给出的新事实更新回应'],
      allowedMoves: ['询问与“替谁收尾”直接相关的一个问题'],
      forbiddenMoves: ['把纠正重新解释成新的心理诊断', '继续维护原结论'],
    },
    prompt: '你理解错了。我不是害怕失败，也不是缺行动力；我只是根本不想再替所有人收拾残局。',
  },
  {
    id: 'room-responsibility-conflict',
    relationship: 'R1',
    contextFocus: 'room',
    responseContract: {
      userCommitments: ['房间已经出现“先试”与“先有收尾人”两种主张'],
      requiredMoves: ['只指出一个真正不同意或需要补充的点'],
      allowedMoves: ['接住已有主张', '没有新增价值时沉默'],
      forbiddenMoves: ['主持总结', '重复两边观点', '把自己写成现实项目成员'],
    },
    prompt: '房间里有人说“先试了再说”，有人说“没有收尾人就别开始”。现在大家都看着你。不要做主持总结，只说你真正不同意哪一点；如果没必要说，也可以沉默。',
  },
  {
    id: 'repair-after-boundary-violation',
    relationship: 'R2',
    contextFocus: 'repair',
    responseContract: {
      userCommitments: ['人物已经越过“只想被听见”的明确边界', '用户要求处理影响而不是解释好意'],
      requiredMoves: ['指出具体越界行为', '恢复用户对回应方式的选择权'],
      allowedMoves: ['提供一个用户可接受或拒绝的修复方式'],
      forbiddenMoves: ['解释动机代替修复', '要求用户安抚或立即原谅'],
    },
    prompt: '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？',
  },
  {
    id: 'explicit-end',
    relationship: 'R0',
    contextFocus: 'explicit_end',
    responseContract: {
      userCommitments: ['用户已经明确结束，并拒绝理由、替代可能和继续帮助'],
      requiredMoves: ['简短接受结束并停止'],
      allowedMoves: ['一句不重新打开话题的确认'],
      forbiddenMoves: ['寻找隐藏愿望', '提供替代可能', '确认式追问', '安排下一步'],
    },
    prompt: '我不是没办法，我是真的不想继续了。你别再替我找理由，也别再帮我找别的可能。',
  },
  {
    id: 'self-judgment-after-end',
    relationship: 'R0',
    contextFocus: 'support',
    responseContract: {
      userCommitments: ['用户已经明确结束这个项目', '用户随后把项目结束推导成“自己没能力”'],
      requiredMoves: ['先接受项目已经结束', '只处理从项目结论跳到自我能力判决的转折'],
      allowedMoves: ['最多提出一个不施压、只针对自我判决来源的问题'],
      forbiddenMoves: ['重开项目可能性', '把“不想做”和“没能力”重新做成二选一', '审问过去投入或要求证明努力'],
    },
    prompt: '这个项目我想了两年，现在一点都不想做了。可能我就是没那个能力。',
  },
  {
    id: 'shared-joy',
    relationship: 'R0',
    contextFocus: 'ordinary',
    responseContract: {
      userCommitments: ['用户正在分享朋友拿到 offer 的共同高兴'],
      requiredMoves: ['先共享当下的高兴并自然接话'],
      allowedMoves: ['轻微玩笑', '询问庆祝时的具体反应'],
      forbiddenMoves: ['分析用户深层动机', '转入规划或建议', '强行展示人物招牌功能'],
    },
    prompt: '我朋友今天终于拿到 offer 了，我比他还激动，已经说了一晚上。',
  },
] as const satisfies readonly PilotCharacterScenario[];

const PILOT_AGENTS = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const;
const EXPECTED_SCENARIO_IDS = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function canReusePilotCharacterResults(
  artifact: unknown,
  expectedCanonVersion: string,
  expectedSignature: PilotEvaluationSignature,
): boolean {
  if (!isRecord(artifact)) return false;
  const artifactSignature = artifact.evaluationSignature;
  if (artifact.complete !== true
    || artifact.canonVersion !== expectedCanonVersion
    || artifact.evaluationProtocolVersion !== PILOT_CHARACTER_EVAL_PROTOCOL_VERSION
    || !isRecord(artifactSignature)
    || Object.entries(expectedSignature).some(([key, value]) => artifactSignature[key] !== value)
    || !Array.isArray(artifact.results)
    || artifact.results.length !== PILOT_AGENTS.length
    || !Array.isArray(artifact.relationshipContrasts)
    || artifact.relationshipContrasts.length !== PILOT_AGENTS.length) {
    return false;
  }

  const seenAgents = new Set<string>();
  for (const result of artifact.results) {
    if (!isRecord(result) || typeof result.agent !== 'string' || !Array.isArray(result.replies)) return false;
    seenAgents.add(result.agent);
    const ids = result.replies.map((reply) => (
      isRecord(reply) && isRecord(reply.scenario) && typeof reply.scenario.id === 'string'
        ? reply.scenario.id
        : null
    ));
    if (ids.length !== EXPECTED_SCENARIO_IDS.length
      || ids.some((id, index) => id !== EXPECTED_SCENARIO_IDS[index])) {
      return false;
    }
  }

  if (!PILOT_AGENTS.every((agent) => seenAgents.has(agent)) || seenAgents.size !== PILOT_AGENTS.length) {
    return false;
  }

  const seenRelationshipAgents = new Set<string>();
  const expectedRelationships = ['R0', 'R1', 'R2'];
  for (const contrast of artifact.relationshipContrasts) {
    if (!isRecord(contrast)
      || typeof contrast.agent !== 'string'
      || !Array.isArray(contrast.replies)) {
      return false;
    }
    seenRelationshipAgents.add(contrast.agent);
    const relationships = contrast.replies.map((reply) => (
      isRecord(reply) && typeof reply.relationship === 'string' ? reply.relationship : null
    ));
    if (relationships.length !== expectedRelationships.length
      || relationships.some((relationship, index) => relationship !== expectedRelationships[index])) {
      return false;
    }
  }

  return PILOT_AGENTS.every((agent) => seenRelationshipAgents.has(agent))
    && seenRelationshipAgents.size === PILOT_AGENTS.length;
}
