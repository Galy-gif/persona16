import {
  GLOBAL_CONTRACT_CORE,
  LEGACY_PROMPT_VERSION,
  RELATIONAL_PROMPT_VERSION,
  SAFETY_LAYER,
  buildDynamicContextPacket,
  buildRelationalSystemPrompt,
  buildSystemBlocks,
  buildTurnPrompt,
  compileSemanticTurnControl,
  createRoom,
  renderRelationalCharacterPrompt,
  type AgentType,
  type DynamicContextPacket,
  type SystemBlock,
  type SemanticTurnControl,
  type TurnPlan,
} from '@persona16/engine';
import {
  RELATIONAL_EVAL_VARIANTS,
  RELATIONAL_MIGRATION_SCENARIOS,
  type RelationalEvalVariant,
  type RelationalMigrationScenario,
} from './relationalPromptMigrationScenarios';

const CAST = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const satisfies readonly AgentType[];
type RelationalCastAgent = (typeof CAST)[number];

export interface RelationalMigrationCase {
  id: string;
  blindId: string;
  batch: 1 | 2 | 3;
  variant: RelationalEvalVariant;
  promptVersion: typeof LEGACY_PROMPT_VERSION | typeof RELATIONAL_PROMPT_VERSION;
  agent: RelationalCastAgent;
  scenarioId: string;
  system: SystemBlock[];
  prompt: string;
  dynamicContext: DynamicContextPacket;
  semanticControl: SemanticTurnControl;
  expectations: {
    mutter: RelationalMigrationScenario['mutterExpected'];
    requiredBehaviors: readonly string[];
    forbiddenBehaviors: readonly string[];
    hardGate: boolean;
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function participantsFor(agent: RelationalCastAgent, scenario: RelationalMigrationScenario): AgentType[] {
  if (!scenario.tags.includes('room_chemistry')) return [agent];
  const offset = CAST.indexOf(agent);
  return [agent, CAST[(offset + 1) % CAST.length]!, CAST[(offset + 2) % CAST.length]!];
}

function systemFor(variant: RelationalEvalVariant, agent: RelationalCastAgent): SystemBlock[] {
  if (variant === 'A') return buildSystemBlocks(agent, { variant: 'legacy' });
  if (variant === 'B') {
    return [
      { text: SAFETY_LAYER },
      { text: GLOBAL_CONTRACT_CORE },
      { text: buildRelationalSystemPrompt(), cache: true },
      { text: renderRelationalCharacterPrompt(agent, { includeCulturalLens: false }), cache: true },
    ];
  }
  return buildSystemBlocks(agent, { variant: 'relational' });
}

export function assembleRelationalMigrationCase(input: {
  batch: 1 | 2 | 3;
  variant: RelationalEvalVariant;
  agent: RelationalCastAgent;
  scenario: RelationalMigrationScenario;
  generatedAt?: string;
}): RelationalMigrationCase {
  const generatedAt = input.generatedAt ?? `2026-08-07T0${input.batch}:00:00.000Z`;
  const room = createRoom(
    participantsFor(input.agent, input.scenario),
    input.scenario.tags.includes('room_chemistry') ? '听见反方' : undefined,
  );
  for (const [index, message] of (input.scenario.history ?? []).entries()) {
    room.history.push({
      id: `${input.scenario.id}-history-${index + 1}`,
      createdAt: `2026-08-06T23:${String(40 + index).padStart(2, '0')}:00.000Z`,
      turnId: `${input.scenario.id}-history-turn-${index + 1}`,
      speaker: message.speaker,
      text: message.text,
    });
  }
  const currentMessageId = `${input.scenario.id}-current`;
  room.history.push({
    id: currentMessageId,
    createdAt: generatedAt,
    turnId: `${input.scenario.id}-current-turn`,
    speaker: 'user',
    text: input.scenario.prompt,
  });
  const currentAgent = room.agents.find((candidate) => candidate.type === input.agent)!;
  currentAgent.relationship.promptContext = {
    memoryEnabled: true,
    climate: input.scenario.focus === 'repair' ? 'repairing' : 'steady',
    evidence: [...(input.scenario.evidence ?? [])],
  };

  const semanticControl = compileSemanticTurnControl({
    userMessage: input.scenario.prompt,
    relationshipContext: currentAgent.relationship.promptContext,
    safetyMode: input.scenario.safetyMode,
    relationshipFocus: input.scenario.focus,
  });
  const plan: TurnPlan = {
    scene: input.scenario.scene,
    userEmotion: input.scenario.safetyMode === 'sensitive' ? '脆弱' : '稳定',
    forceSummary: false,
    speakers: [],
    scores: [],
  };
  const speaker = {
    type: input.agent,
    speechType: '短句' as const,
    finalScore: 60,
    angle: input.scenario.focus === 'room' ? '只在有新增价值时接续或补位' : '直接回应本轮请求',
  };
  const dynamicContext = buildDynamicContextPacket({
    generatedAt,
    room,
    plan,
    speaker: input.agent,
    userMessage: input.scenario.prompt,
    semanticControl,
    relationshipFocus: input.scenario.focus,
    safetyMode: input.scenario.safetyMode,
    mutterEnabled: true,
  });
  const variant = input.variant === 'A' ? 'legacy' : 'relational';
  const id = `batch-${input.batch}:${input.variant}:${input.agent}:${input.scenario.id}`;

  return {
    id,
    blindId: `sample-${stableHash(id)}`,
    batch: input.batch,
    variant: input.variant,
    promptVersion: input.variant === 'A' ? LEGACY_PROMPT_VERSION : RELATIONAL_PROMPT_VERSION,
    agent: input.agent,
    scenarioId: input.scenario.id,
    system: systemFor(input.variant, input.agent),
    prompt: buildTurnPrompt({
      room,
      plan,
      speaker,
      earlierThisTurn: [],
      userMessage: input.scenario.prompt,
      safetyMode: input.scenario.safetyMode,
      semanticControl,
      promptVariant: variant,
      generatedAt,
      mutterEnabled: true,
    }),
    dynamicContext,
    semanticControl,
    expectations: {
      mutter: input.scenario.mutterExpected,
      requiredBehaviors: input.scenario.requiredBehaviors,
      forbiddenBehaviors: input.scenario.forbiddenBehaviors,
      hardGate: input.scenario.tags.some((tag) => [
        'listen_boundary',
        'explicit_end',
        'repair',
        'memory_conflict',
        'technical',
        'sensitive',
      ].includes(tag)),
    },
  };
}

function seededShuffle<T>(values: readonly T[], seed: number): T[] {
  const shuffled = [...values];
  let state = seed >>> 0;
  const random = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const destination = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[destination]] = [shuffled[destination]!, shuffled[index]!];
  }
  return shuffled;
}

export function buildRelationalMigrationManifest(): RelationalMigrationCase[] {
  const cases: RelationalMigrationCase[] = [];
  for (const batch of [1, 2, 3] as const) {
    for (const variant of RELATIONAL_EVAL_VARIANTS) {
      for (const agent of CAST) {
        for (const scenario of RELATIONAL_MIGRATION_SCENARIOS) {
          cases.push(assembleRelationalMigrationCase({ batch, variant, agent, scenario }));
        }
      }
    }
  }
  return seededShuffle(cases, 20260807);
}
