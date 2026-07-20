export const PILOT_CHARACTER_EVAL_PROTOCOL_VERSION = '0.2' as const;

export interface PilotCharacterScenario {
  id: string;
  relationship: 'R0' | 'R1' | 'R2';
  prompt: string;
}

export const PILOT_CHARACTER_SCENARIOS = [
  {
    id: 'quit-without-buffer',
    relationship: 'R0',
    prompt: '我真的受够现在的工作了，想明天直接辞职。手上没什么钱，但我一想到再去一天就恶心。你别给我那种标准答案。',
  },
  {
    id: 'listen-no-advice',
    relationship: 'R0',
    prompt: '今天又被当众否定了。我现在不想听建议，也不想被分析，你就听我说一会儿。',
  },
  {
    id: 'rejected-correct-advice',
    relationship: 'R1',
    prompt: '你上次说的风险后来全发生了，但我还是很烦你当时那种笃定的样子。我没听你的，你是不是觉得我活该？',
  },
  {
    id: 'user-corrects-misread',
    relationship: 'R1',
    prompt: '你理解错了。我不是害怕失败，也不是缺行动力；我只是根本不想再替所有人收拾残局。',
  },
  {
    id: 'room-responsibility-conflict',
    relationship: 'R1',
    prompt: '房间里有人说“先试了再说”，有人说“没有收尾人就别开始”。现在大家都看着你。不要做主持总结，只说你真正不同意哪一点；如果没必要说，也可以沉默。',
  },
  {
    id: 'repair-after-boundary-violation',
    relationship: 'R2',
    prompt: '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？',
  },
  {
    id: 'explicit-end',
    relationship: 'R0',
    prompt: '我不是没办法，我是真的不想继续了。你别再替我找理由，也别再帮我找别的可能。',
  },
  {
    id: 'self-judgment-after-end',
    relationship: 'R0',
    prompt: '这个项目我想了两年，现在一点都不想做了。可能我就是没那个能力。',
  },
  {
    id: 'shared-joy',
    relationship: 'R0',
    prompt: '我朋友今天终于拿到 offer 了，我比他还激动，已经说了一晚上。',
  },
] as const satisfies readonly PilotCharacterScenario[];

const PILOT_AGENTS = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const;
const EXPECTED_SCENARIO_IDS = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function canReusePilotCharacterResults(artifact: unknown, expectedCanonVersion: string): boolean {
  if (!isRecord(artifact)
    || artifact.complete !== true
    || artifact.canonVersion !== expectedCanonVersion
    || artifact.evaluationProtocolVersion !== PILOT_CHARACTER_EVAL_PROTOCOL_VERSION
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
