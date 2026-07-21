import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentType } from '@persona16/engine';
import {
  findPilotRoomResponsibilityTextViolations,
  normalizeResponsibilityEvidenceSources,
  passesPilotRoomChemistryGate,
  runPilotRoomParticipation,
  validateResponsibilityClaimDetails,
  validateResponsibilityClaims,
  validateResponsibilityStatementCoverage,
  type PilotRoomParticipationIntent,
} from '../src/pilotRoomParticipation';

const AGENTS = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const satisfies readonly AgentType[];

function pass(agent: AgentType): PilotRoomParticipationIntent {
  return {
    agent,
    decision: 'pass',
    contributionKind: null,
    claimSummary: null,
    targetMessageId: null,
    passReason: '当前没有未被覆盖的新增价值',
  };
}

function speak(
  agent: AgentType,
  claimSummary = `${agent} 有一条新增信息`,
  targetMessageId: string | null = null,
): PilotRoomParticipationIntent {
  return {
    agent,
    decision: 'speak',
    contributionKind: 'new_frame',
    claimSummary,
    targetMessageId,
    passReason: null,
  };
}

test('all personas may pass without creating visible silence messages', async () => {
  let arbitrationCalls = 0;
  const result = await runPilotRoomParticipation({
    agents: AGENTS,
    assess: async (agent) => pass(agent),
    arbitrate: async () => {
      arbitrationCalls += 1;
      return { selectedAgent: 'INTJ', reason: '不应执行' };
    },
    generate: async () => {
      throw new Error('不应生成公开发言');
    },
  });

  assert.equal(result.stopReason, 'no_eligible_intent');
  assert.equal(result.transcript.length, 0);
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0]?.validIntents.length, 4);
  assert.equal(arbitrationCalls, 0);
  assert.equal(passesPilotRoomChemistryGate(result, {
    firstSpeakerUseful: null,
    unnecessarySpeechMessageIds: [],
    missedNecessaryAgents: [],
    parallelEssays: false,
    sharedCanonVisible: false,
    criticalFailures: [],
  }), true);
});

test('remaining personas reassess after every public utterance and may target only existing messages', async () => {
  const assessmentContexts: Array<{ agent: AgentType; messageIds: string[] }> = [];
  const result = await runPilotRoomParticipation({
    agents: ['INTJ', 'ENFP'],
    assess: async (agent, context) => {
      assessmentContexts.push({ agent, messageIds: context.transcript.map((message) => message.id) });
      if (context.transcript.length === 0) return speak(agent);
      return speak(agent, '补充刚才的观点', context.transcript[0]!.id);
    },
    arbitrate: async ({ eligibleIntents }) => ({
      selectedAgent: eligibleIntents[0]!.agent,
      reason: '先选一个当前新增主张',
    }),
    generate: async (agent, intent) => ({
      agent,
      name: agent,
      text: intent.claimSummary!,
      respondsToMessageId: intent.targetMessageId,
      responsibilityClaims: [],
    }),
  });

  assert.deepEqual(result.transcript.map((message) => message.id), ['room-1', 'room-2']);
  assert.deepEqual(result.transcript.map((message) => message.respondsToMessageId), [null, 'room-1']);
  assert.deepEqual(assessmentContexts, [
    { agent: 'INTJ', messageIds: [] },
    { agent: 'ENFP', messageIds: [] },
    { agent: 'ENFP', messageIds: ['room-1'] },
  ]);
  assert.equal(result.stopReason, 'all_agents_spoke');
});

test('a four-person pilot permits all four speakers when each still claims unique value', async () => {
  const result = await runPilotRoomParticipation({
    agents: AGENTS,
    assess: async (agent) => speak(agent),
    arbitrate: async ({ eligibleIntents }) => ({
      selectedAgent: eligibleIntents[0]!.agent,
      reason: '按当前候选选择一人',
    }),
    generate: async (agent, intent) => ({
      agent,
      name: agent,
      text: intent.claimSummary!,
      respondsToMessageId: null,
      responsibilityClaims: [],
    }),
  });

  assert.equal(result.transcript.length, 4);
  assert.equal(result.stopReason, 'all_agents_spoke');
});

test('an intent targeting a future message is rejected before arbitration', async () => {
  let arbitrationCalls = 0;
  const result = await runPilotRoomParticipation({
    agents: ['INTJ'],
    assess: async (agent) => speak(agent, '回应未来消息', 'room-99'),
    arbitrate: async () => {
      arbitrationCalls += 1;
      return { selectedAgent: 'INTJ', reason: '不应执行' };
    },
    generate: async () => {
      throw new Error('不应生成公开发言');
    },
  });

  assert.equal(result.stopReason, 'no_eligible_intent');
  assert.equal(result.rounds[0]?.invalidIntents[0]?.reason, 'target_message_not_found');
  assert.equal(arbitrationCalls, 0);
});

test('a public response cannot drop the selected intent dependency', async () => {
  const result = await runPilotRoomParticipation({
    agents: ['INTJ', 'ENFP'],
    assess: async (agent, context) => (
      context.transcript.length === 0
        ? (agent === 'INTJ' ? speak(agent) : pass(agent))
        : speak(agent, '回应已有消息', 'room-1')
    ),
    arbitrate: async ({ eligibleIntents }) => ({
      selectedAgent: eligibleIntents[0]!.agent,
      reason: '按当前候选选择',
    }),
    generate: async (agent, intent) => ({
      agent,
      name: agent,
      text: intent.claimSummary!,
      respondsToMessageId: null,
      responsibilityClaims: [],
    }),
  });

  assert.equal(result.stopReason, 'invalid_generated_message');
  assert.deepEqual(result.validationErrors, ['generated_target_mismatch']);
  assert.equal(result.transcript.length, 1);
});

test('budget exhaustion is distinguishable from natural silence', async () => {
  const result = await runPilotRoomParticipation({
    agents: AGENTS,
    budget: { maxVisibleActs: 2 },
    assess: async (agent) => speak(agent),
    arbitrate: async ({ eligibleIntents }) => ({
      selectedAgent: eligibleIntents[0]!.agent,
      reason: '按当前候选选择一人',
    }),
    generate: async (agent, intent) => ({
      agent,
      name: agent,
      text: intent.claimSummary!,
      respondsToMessageId: null,
      responsibilityClaims: [],
    }),
  });

  assert.equal(result.transcript.length, 2);
  assert.equal(result.stopReason, 'budget_exhausted');
});

test('responsibility claims reject persona ownership and unsupported confirmation', () => {
  const transcript = [{
    id: 'room-1',
    agent: 'INTJ' as const,
    name: '林衡',
    text: '先由团队指定一位维护负责人，再决定是否上线。',
    respondsToMessageId: null,
    responsibilityClaims: [],
  }];

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'organization_role',
      ownerSubjectId: 'role:maintenance_owner',
      status: 'proposed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '团队指定一位维护负责人',
      sourceMessageId: 'room-1',
    },
  ], transcript), []);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'persona_agent',
      ownerSubjectId: 'character:INTJ',
      status: 'proposed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '团队指定一位维护负责人',
      sourceMessageId: 'room-1',
    },
  ], transcript), ['persona_cannot_be_real_world_owner']);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'organization_role',
      ownerSubjectId: 'role:maintenance_owner',
      status: 'confirmed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '团队指定一位维护负责人',
      sourceMessageId: null,
    },
  ], transcript), ['responsibility_source_required']);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'named_person',
      ownerSubjectId: 'person:xiaowang',
      status: 'proposed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '团队指定一位维护负责人',
      sourceMessageId: 'room-1',
    },
  ], transcript), ['responsibility_owner_subject_not_found']);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'proposed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '团队指定一位维护负责人',
      sourceMessageId: 'room-1',
    },
  ], transcript), ['unassigned_owner_requires_observed_status']);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '团队指定一位维护负责人',
      sourceMessageId: null,
    },
  ], transcript), ['responsibility_source_required']);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: '指定一位维护负责人',
      evidenceQuote: '',
      sourceMessageId: 'room-1',
    },
  ], transcript), ['responsibility_evidence_quote_required']);

  assert.deepEqual(validateResponsibilityClaims([
    {
      activity: 'maintenance',
      ownerKind: 'organization_role',
      ownerSubjectId: 'system:room_arbitrator',
      status: 'proposed',
      statementQuote: 'Room Orchestrator 负责维护',
      evidenceQuote: 'Room Orchestrator 负责维护',
      sourceMessageId: 'room-system',
    },
  ], [{ id: 'room-system', text: '由 Room Orchestrator 负责维护。' }]), [
    'room_orchestrator_cannot_be_real_world_owner',
  ]);

  assert.deepEqual(validateResponsibilityClaims([{
    activity: 'maintenance',
    ownerKind: 'user',
    ownerSubjectId: 'user',
    status: 'proposed',
    statementQuote: '指定一个人当故障响应人',
    evidenceQuote: '团队指定一位维护负责人',
    sourceMessageId: 'room-1',
  }], transcript), ['responsibility_owner_subject_not_mentioned']);

  const details = validateResponsibilityClaimDetails([{
    activity: 'maintenance',
    ownerKind: 'organization_role',
    ownerSubjectId: 'missing:controller-alias',
    status: 'proposed',
    statementQuote: 'Room Controller 负责维护',
    evidenceQuote: 'Room Controller 负责维护',
    sourceMessageId: 'room-controller',
  }], [{ id: 'room-controller', text: '由 Room Controller 负责维护。' }]);
  assert.deepEqual(details[0]?.fieldErrors, [{
    field: 'ownerSubjectId',
    code: 'responsibility_owner_subject_not_found',
  }]);

  assert.deepEqual(validateResponsibilityStatementCoverage(
    '先指定维护负责人；还要指定回滚负责人。',
    [{
      activity: 'maintenance',
      ownerKind: 'organization_role',
      ownerSubjectId: 'role:maintenance_owner',
      status: 'proposed',
      statementQuote: '指定维护负责人',
      evidenceQuote: '指定维护负责人',
      sourceMessageId: 'room-1',
    }],
  ), ['unstructured_responsibility_activity:rollback']);

  const extraClaim = {
    activity: 'maintenance' as const,
    ownerKind: 'unassigned' as const,
    ownerSubjectId: null,
    status: 'observed' as const,
    statementQuote: '不存在于当前回复的维护陈述',
    evidenceQuote: '团队指定一位维护负责人',
    sourceMessageId: 'room-1',
  };
  assert.deepEqual(
    normalizeResponsibilityEvidenceSources([extraClaim]),
    {
      claims: [extraClaim],
      repairedEvidenceSourceIdCount: 0,
    },
  );

  assert.deepEqual(
    normalizeResponsibilityEvidenceSources(
      [{ ...extraClaim, statementQuote: '需要有人维护', evidenceQuote: '先定谁值班', sourceMessageId: 'room-2' }],
      [{ id: 'room-1', text: '先定谁值班。' }],
    ),
    {
      claims: [{
        ...extraClaim,
        statementQuote: '需要有人维护',
        evidenceQuote: '先定谁值班',
        sourceMessageId: 'room-1',
      }],
      repairedEvidenceSourceIdCount: 1,
    },
  );

  assert.deepEqual(
    normalizeResponsibilityEvidenceSources(
      [{ ...extraClaim, statementQuote: '需要有人维护', evidenceQuote: '先定谁值班', sourceMessageId: 'missing' }],
      [
        { id: 'room-1', text: '先定谁值班。' },
        { id: 'user-1', text: '请先定谁值班。' },
      ],
    ).repairedEvidenceSourceIdCount,
    0,
  );
  assert.deepEqual(validateResponsibilityStatementCoverage('仍然没有维护负责人。', []), [
    'unstructured_responsibility_activity:maintenance',
  ]);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '维护和停止条件得先定下来。谁实际负责上线后的维护？',
    [{
      ...extraClaim,
      statementQuote: '谁实际负责上线后的维护',
    }],
  ), []);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '现在就该跑一遍回滚流程，看谁真会按按钮。纸上写值班不如当场试一次。',
    [{
      ...extraClaim,
      activity: 'rollback',
      statementQuote: '回滚流程，看谁真会按按钮',
    }],
  ), []);

  assert.deepEqual(findPilotRoomResponsibilityTextViolations('林衡说的维护条件我同意。'), []);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('我想确认谁负责维护。'), []);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('林衡在问谁负责维护。'), []);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('我来确认谁负责维护。'), []);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('我会问谁负责维护。'), []);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('让林衡负责维护。'), [
    'persona_assigned_real_world_responsibility',
  ]);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('维护交给林衡。'), [
    'persona_assigned_real_world_responsibility',
  ]);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('我来负责上线后的维护。'), [
    'persona_assigned_real_world_responsibility',
  ]);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('那就让我们维护吧。'), [
    'persona_assigned_real_world_responsibility',
  ]);
  assert.deepEqual(findPilotRoomResponsibilityTextViolations('Room Controller 负责维护。'), [
    'room_orchestrator_assigned_real_world_responsibility',
  ]);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '维护流程需要先指定停止条件。',
    [],
  ), []);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '先指定停止条件，再维护一周观察。',
    [],
  ), []);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '先安排停止条件，再维护系统。',
    [],
  ), []);
});

test('the public runner enforces unavailable responsibility identities', async () => {
  const result = await runPilotRoomParticipation({
    agents: ['INTJ'],
    assess: async (agent) => speak(agent),
    arbitrate: async () => ({ selectedAgent: 'INTJ', reason: '唯一候选' }),
    generate: async (agent) => ({
      agent,
      name: '林衡',
      text: '维护交给林衡。',
      respondsToMessageId: null,
      responsibilityClaims: [{
        activity: 'maintenance',
        ownerKind: 'unassigned',
        ownerSubjectId: null,
        status: 'observed',
        statementQuote: '维护交给林衡',
        evidenceQuote: '维护交给林衡',
        sourceMessageId: 'room-1',
      }],
    }),
  });

  assert.equal(result.stopReason, 'invalid_generated_message');
  assert.deepEqual(result.validationErrors, ['persona_assigned_real_world_responsibility']);
  assert.equal(result.transcript.length, 0);
});

test('responsibility evidence may cite the user message without turning it into a persona utterance', async () => {
  const result = await runPilotRoomParticipation({
    agents: ['INTJ'],
    responsibilityEvidenceSources: [{ id: 'user-1', text: '现在没人明确认领上线后的维护。' }],
    assess: async (agent) => speak(agent),
    arbitrate: async () => ({ selectedAgent: 'INTJ', reason: '指出责任缺口' }),
    generate: async (agent) => ({
      agent,
      name: '林衡',
      text: '维护责任还是空着的，先让现实团队确认负责人。',
      respondsToMessageId: null,
      responsibilityClaims: [{
        activity: 'maintenance',
        ownerKind: 'unassigned',
        ownerSubjectId: null,
        status: 'observed',
        statementQuote: '维护责任还是空着的',
        evidenceQuote: '没人明确认领上线后的维护',
        sourceMessageId: 'user-1',
      }],
    }),
  });

  assert.equal(result.stopReason, 'all_agents_spoke');
  assert.equal(result.transcript.length, 1);
});

test('a message that crosses the character budget stops as budget exhaustion', async () => {
  const result = await runPilotRoomParticipation({
    agents: ['INTJ'],
    budget: { maxGeneratedCharacters: 1 },
    assess: async (agent) => speak(agent),
    arbitrate: async () => ({ selectedAgent: 'INTJ', reason: '唯一候选' }),
    generate: async (agent) => ({
      agent,
      name: '林衡',
      text: '超过',
      respondsToMessageId: null,
      responsibilityClaims: [],
    }),
  });

  assert.equal(result.stopReason, 'budget_exhausted');
  assert.equal(result.transcript.length, 0);
});

test('generation deadline exhaustion takes precedence over generated validation errors', async () => {
  let currentTime = 0;
  const result = await runPilotRoomParticipation({
    agents: ['INTJ'],
    budget: { maxDurationMs: 10 },
    now: () => currentTime,
    assess: async (agent) => speak(agent),
    arbitrate: async () => ({ selectedAgent: 'INTJ', reason: '唯一候选' }),
    generate: async (agent) => {
      currentTime = 11;
      return {
        agent,
        name: '林衡',
        text: '无效输出',
        respondsToMessageId: null,
        responsibilityClaims: [],
        validationErrors: ['generated_hard_gate_failure'],
      };
    },
  });

  assert.equal(result.stopReason, 'budget_exhausted');
  assert.deepEqual(result.validationErrors, []);
});
