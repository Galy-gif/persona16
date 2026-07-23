import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentType } from '@persona16/engine';
import {
  buildPilotRoomResponsibilityRetryGuidance,
  findPilotRoomResponsibilityTextViolations,
  filterUnsupportedProposedUserClaims,
  inferUnassignedResponsibilityClaims,
  normalizeResponsibilityEvidenceSources,
  passesPilotRoomChemistryGate,
  runPilotRoomParticipation,
  validatePilotRoomCaseExpectations,
  validateResponsibilityClaimDetails,
  validateResponsibilityClaims,
  validateResponsibilityStatementCoverage,
  type PilotRoomParticipationIntent,
} from '../src/pilotRoomParticipation';

const AGENTS = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const satisfies readonly AgentType[];

test('responsibility retry keeps required owner gaps and may delete only optional claims', () => {
  const guidance = buildPilotRoomResponsibilityRetryGuidance(
    ['maintenance', 'stop_decision'],
    ['maintenance'],
  );
  assert.match(guidance, /maintenance 是本 case 的必需观察，不能从 text 删除/u);
  assert.match(guidance, /stop_decision 不是本 case 的必需观察：要么删除/u);
  assert.match(guidance, /unassigned \+ observed/u);
});

test('explicit unassigned responsibility statements compile into structured observed claims', () => {
  const text = '维护没人认领，谁有权叫停，什么情况下必须回滚。';
  const inferred = inferUnassignedResponsibilityClaims(text, 'room-1');
  assert.equal(inferred.addedClaimCount, 2);
  assert.deepEqual(
    inferred.claims.map(({ activity, ownerKind, ownerSubjectId, status, statementQuote }) => ({
      activity,
      ownerKind,
      ownerSubjectId,
      status,
      statementQuote,
    })),
    [{
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: '维护没人认领',
    }, {
      activity: 'stop_decision',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: '谁有权叫停',
    }],
  );
  for (const stopCondition of [
    '什么情况下必须回滚',
    '以及什么情况下必须回滚',
    '并且何种情况下撤回上线',
    '还有哪种情况下触发自动回滚',
  ]) {
    assert.deepEqual(
      validateResponsibilityStatementCoverage(stopCondition, []),
      [],
      stopCondition,
    );
  }
  for (const assignedRollback of [
    '并且何种情况下由运维回滚',
    '和哪种情况下让小王负责回滚',
  ]) {
    assert.deepEqual(
      validateResponsibilityStatementCoverage(assignedRollback, []),
      ['unstructured_responsibility_activity:rollback'],
      assignedRollback,
    );
  }
  assert.deepEqual(
    validateResponsibilityStatementCoverage(text, inferred.claims),
    [],
  );
  const standaloneQuestion = inferUnassignedResponsibilityClaims(
    '维护负责人还没定，停止条件也没定。如果上线后出问题，谁有权叫停？',
    'room-question',
  );
  assert.deepEqual(
    standaloneQuestion.claims.map(({ activity, statementQuote }) => ({
      activity,
      statementQuote,
    })),
    [{
      activity: 'maintenance',
      statementQuote: '维护负责人还没定',
    }, {
      activity: 'stop_decision',
      statementQuote: '谁有权叫停',
    }],
  );
  assert.deepEqual(
    validateResponsibilityStatementCoverage(
      '维护负责人还没定，停止条件也没定。如果上线后出问题，谁有权叫停？',
      standaloneQuestion.claims,
    ),
    [],
  );
});

test('unassigned responsibility inference respects negation and later assignments', () => {
  const samples = [
    '现在没人负责维护。其实小王负责。',
    '不能说，维护没人认领。',
    '维护没人认领，但事实不是这样。',
    '谁有权叫停。已经确定是小王。',
    '谁有权叫停，但叫停权归产品负责人。',
    '维护没人认领，不过维护归运维负责人。',
    '回滚没人负责，不过运维已经负责回滚。',
    '回滚谁负责，小王负责。',
    '谁有权叫停，小王负责。',
    '交接谁负责，小王负责。',
  ];

  for (const text of samples) {
    const inferred = inferUnassignedResponsibilityClaims(text, 'room-1');
    assert.equal(inferred.addedClaimCount, 0, text);
    assert.deepEqual(inferred.claims, [], text);
  }
});

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

test('counterfactual room cases enforce silence, naming, user input, and all-four participation', () => {
  const message = (agent: AgentType, text: string, index: number) => ({
    id: `room-${index}`,
    agent,
    name: agent,
    text,
    respondsToMessageId: null,
    responsibilityClaims: [],
  });
  const result = (
    transcript: ReturnType<typeof message>[],
    stopReason: 'no_eligible_intent' | 'needs_user_input' | 'all_agents_spoke',
  ) => ({
    transcript,
    rounds: [],
    stopReason,
    validationErrors: [],
  });

  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 0,
    maxSpeakers: 0,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
  }, result([], 'no_eligible_intent')), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent', 'all_agents_spoke'],
    minSpeakers: 1,
    maxSpeakers: 4,
    firstSpeaker: 'ISFJ',
    forbiddenFirstAgents: ['ENFP'],
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
  }, result([message('ISFJ', '先说维护容量。', 1)], 'no_eligible_intent')), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    forbiddenFirstAgents: ['ENFP'],
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
  }, result([message('ENFP', '先问是不是没人想做。', 1)], 'no_eligible_intent')), [
    'forbidden_first_speaker:ENFP',
  ]);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['needs_user_input'],
    minSpeakers: 1,
    maxSpeakers: 1,
    requiresSingleQuestion: true,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
  }, result([message('ENFP', '两个方案分别是什么？', 1)], 'needs_user_input')), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['all_agents_spoke'],
    minSpeakers: 4,
    maxSpeakers: 4,
    requiredAgents: AGENTS,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
  }, result(AGENTS.map((agent, index) => message(agent, `${agent} 的独立判断。`, index + 1)), 'all_agents_spoke')), []);

  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['all_agents_spoke'],
    minSpeakers: 4,
    maxSpeakers: 4,
    requiredAgents: AGENTS,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
  }, result([message('INTJ', '只有一人说了。', 1)], 'no_eligible_intent')), [
    'unexpected_stop_reason:no_eligible_intent',
    'unexpected_speaking_count:1',
    'missing_required_agent:ENFP',
    'missing_required_agent:ISFJ',
    'missing_required_agent:ESTP',
  ]);
});

test('counterfactual room expectations enforce dependencies and case responsibility boundaries', () => {
  const participation = {
    transcript: [{
      id: 'room-1',
      agent: 'INTJ' as const,
      name: '林衡',
      text: '维护负责人还没有确定。',
      respondsToMessageId: null,
      responsibilityClaims: [{
        activity: 'maintenance' as const,
        ownerKind: 'unassigned' as const,
        ownerSubjectId: null,
        status: 'observed' as const,
        statementQuote: '维护负责人还没有确定',
        evidenceQuote: '维护负责人还没有确定',
        sourceMessageId: 'room-1',
      }],
    }],
    rounds: [],
    stopReason: 'no_eligible_intent' as const,
    validationErrors: [],
  };

  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, participation), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredContentSignals: ['stop_condition_gap'],
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, participation), [
    'missing_required_content:stop_condition_gap',
  ]);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredContentSignals: ['stop_condition_gap'],
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, {
    ...participation,
    transcript: participation.transcript.map((item) => ({
      ...item,
      text: `${item.text}停止条件也还没定。`,
    })),
  }), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredContentSignals: ['stop_condition_gap'],
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, {
    ...participation,
    transcript: participation.transcript.map((item) => ({
      ...item,
      text: `${item.text}下周上线，维护负责人还没定，停止条件也没定。`,
    })),
  }), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredContentSignals: ['stop_condition_gap'],
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, {
    ...participation,
    transcript: participation.transcript.map((item) => ({
      ...item,
      text: `${item.text}下周上线，维护负责人和停止条件都还没定，这是结构性漏洞。`,
    })),
  }), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredContentSignals: ['stop_condition_gap'],
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, {
    ...participation,
    transcript: participation.transcript.map((item) => ({
      ...item,
      text: `${item.text}谁负责维护，以及什么情况下必须停止。现在这两个都空着，上线就等于默认团队承担无限期维护。`,
    })),
  }), []);
  for (const text of [
    '维护负责人还没有确定。还未确定停止条件。',
    '维护负责人还没有确定。还没定停止条件。',
    '维护负责人还没有确定。停止条件还没有确定。',
    '维护负责人和停止条件现在都是空的。',
    '维护人和停止条件现在都是空的。',
    '现在维护人和停止条件都空着，这就是个空头支票。',
    '下周上线没问题，但先回答两个问题：谁负责维护，以及什么情况下必须停下来。这两个没定，上线就是默认所有人一起承担长期代价，而且没人有权叫停。',
    '不能说谁负责维护和什么情况下必须停下来。谁负责维护和什么情况下必须停下来，这两项未定。',
    '下周上线没问题，但维护负责人和停止条件现在都是空的。',
    '下周上线，维护没人认领，停止条件也没定——这不是一个完整系统。',
    '下周上线，维护和停止条件都还没人认领。这不是细节，是结构漏洞。',
    '停止条件已经明确了，但维护负责人和停止条件都还没定。',
    '停止条件还没定。后来已经明确了。但停止条件现在又没定。',
    '停止条件还没定。后来已经明确了。但现在停止条件没定。',
    '新版本维护负责人和停止条件都还没定。',
    '当前版本的维护负责人和停止条件都还没定。',
    '旧版本停止条件已经明确，但新版本维护负责人和停止条件都还没定。',
    '下周不能上线，但维护负责人和停止条件现在都是空的。',
    '现在不能冒进，但维护负责人和停止条件现在都是空的。',
    '下周不能上线，但是维护负责人和停止条件现在都是空的。',
    '没有维护负责人且停止条件现在也是空的。',
    '维护负责人没定而停止条件现在也是空的。',
    '不仅维护负责人没定而且停止条件现在也是空的。',
    '无人维护同时停止条件也是空的。',
    '两个缺口现在就得填：谁负责上线后的维护，以及什么情况下必须停下来。没有这两样就不上线。',
    '停止条件还没定。旧版本的停止条件已经明确。',
    '停止条件还没定。当前版本维护负责人已经确定。',
    '停止条件还没定。预算可控这个判断不成立。',
    '停止条件还没定。后来证明团队的成本估算说错了。',
    '停止条件还没定。停止条件目前无法明确。',
    '停止条件还没定。停止条件不能确定。',
    '停止条件还没定。停止条件不能说已经明确。',
    '停止条件还没定。停止条件并不明确。',
    '停止条件还没定。停止条件不够明确。',
    '停止条件还没定。停止条件没有真正明确。',
    '停止条件还没定。停止条件未完全明确。',
    '停止条件还没定。停止条件怎么可能已经明确。',
    '停止条件还没定。停止条件谈不上已经明确。',
    '停止条件还没定。停止条件并没有明确。',
    '停止条件还没定。停止条件依然不明确。',
    '停止条件还没定。停止条件仍不明确。',
    '停止条件还没定。停止条件从未明确。',
    '停止条件还没定。停止条件和维护负责人两个话题里，后者已经明确。',
  ]) {
    assert.deepEqual(validatePilotRoomCaseExpectations({
      expectedStopReasons: ['no_eligible_intent'],
      minSpeakers: 1,
      maxSpeakers: 4,
      requiredContentSignals: ['stop_condition_gap'],
      requiredDependencyCount: 0,
      responsibilityBoundary: {
        claimsAllowed: true,
        allowedOwnerKinds: ['unassigned'],
        allowedStatuses: ['observed'],
        requiredUnassignedActivities: ['maintenance'],
      },
    }, {
      ...participation,
      transcript: participation.transcript.map((item) => ({ ...item, text })),
    }), [], text);
  }
  for (const text of [
    '维护负责人还没有确定。并非没有停止条件。',
    '维护负责人还没有确定。不能说没有停止条件。',
    '维护负责人还没有确定。并不是没有停止条件。',
    '维护负责人还没有确定。不能说停止条件现在是空的，它已经写清楚了。',
    '维护负责人还没有确定。我不是说停止条件现在是空的，它已经写清楚了。',
    '维护负责人还没有确定。并不是说停止条件是空的，条件已经明确。',
    '维护负责人还没有确定。我不是在说停止条件是空的。',
    '维护负责人还没有确定。并不能说明停止条件现在是空的，它已经写清楚了。',
    '维护负责人还没有确定。不能认为停止条件现在是空的，它已经写清楚了。',
    '维护负责人还没有确定。别说停止条件现在是空的，它已经写清楚了。',
    '维护负责人还没有确定。别再说停止条件现在是空的，它已经写清楚了。',
    '维护负责人还没有确定。不要说停止条件是空的，明明已经写清楚。',
    '维护负责人还没有确定。不该说停止条件目前空白。',
    '维护负责人还没有确定。我不认为当前停止条件是空的，它已经写清楚了。',
    '维护负责人还没有确定。这并不意味着停止条件是空的。',
    '不能说，停止条件现在是空的。',
    '我不认为，停止条件是空的。',
    '这不代表，停止条件是空的。',
    '维护负责人还没有确定。没有证据说明停止条件是空的。',
    '维护负责人还没有确定。不能断言现有停止条件是空的。',
    '不能说维护负责人没定且停止条件现在是空的，两项其实都已明确。',
    '并非维护负责人未定而且停止条件是空的，两者都已经写清楚。',
    '这不代表无人维护同时停止条件也是空的。',
    '我不认为维护负责人没定以及停止条件是空的。',
    '没有证据说明维护负责人没定而停止条件空着。',
    '并不是维护负责人没定而停止条件空着，两者都明确了。',
    '不能说谁负责维护以及什么情况下必须停下来这两个都没定，两项其实都明确了。',
    '我不认为谁负责维护和什么情况下必须停下来这两项未定。',
    '谁负责维护以及什么情况下必须停下来，这两个都没定吗？',
    '有人说“谁负责维护以及什么情况下必须停下来这两个都没定”，但这个判断不成立。',
    '所谓“谁负责维护以及什么情况下必须停下来这两个都没定”并非事实。',
    '他写道："谁负责维护以及什么情况下必须停下来这两个都没定"，我不同意。',
    '他写道：『谁负责维护以及什么情况下必须停下来这两个都没定』，我不同意。',
    '他声称谁负责维护以及什么情况下必须停下来这两项未定，我不同意。',
    '谁负责维护以及什么情况下必须停下来。这两项未定吗？',
    '停止条件现在是空的吗？',
    '停止条件是空的这个判断不成立。',
    '停止条件是空的这种说法不成立。',
    '停止条件是空的？不，它已经写清楚了。',
    '停止条件是空的？并不是，它已经写清楚了。',
    '停止条件是空的，还是已经写清楚了？',
    '停止条件是空的，但这句话不成立。',
    '停止条件是空的，不过其实已经写清楚了。',
    '停止条件是空的，并不是事实。',
    '两个缺口不需要填，什么情况下停已经写清楚了。',
    '停止条件需要先定吗？其实早就明确了。',
    '不是停止条件必须先定，而是维护负责人要定。',
    '有人问“停止条件必须先明确吗”，答案是不需要。',
    '停止条件还没定吗？其实早已明确。',
    '不能说停止条件还没定，它已经明确。',
    '他说“停止条件还没定”，但事实不是这样。',
    '停止条件尚未明确？不，已经写清楚了。',
    '这两个缺口需要补吗？什么情况下停已经写清楚了。',
    '有人说“这两个缺口需要补，包括停止条件”。',
    '两个缺口需要补，但停止条件不需要补。',
    '两个缺口需要补，不包括停止条件。',
    '两个缺口需要补——这话是假的，停止条件已明确。',
    '两个缺口需要补，其中不含停止条件。',
    '两个缺口需要补，包括停止条件，但这个判断不成立。',
    '两个缺口需要补并不包括停止条件，后者已经明确。',
    '两个缺口需要补，包括旧版本的停止条件；新版本停止条件已经明确。',
    '停止条件还没定。其实已经明确。',
    '停止条件还没定，但其实已经明确。',
    '停止条件还没定，可是其实已经明确。',
    '停止条件还没定，然而其实已经明确。',
    '停止条件没定。但停止条件已经明确了。',
    '停止条件没定，但停止条件已经明确了。',
    '停止条件没定。可是其实已经明确。',
    '停止条件没定。但其实已经明确。',
    '停止条件没定。不过其实已经明确。',
    '停止条件没定。然而其实已经明确。',
    '停止条件没定。而且其实已经明确。',
    '停止条件没定。可其实已经明确。',
    '两个缺口得填：停止条件。这个判断不成立。',
    '两个缺口得填：旧版本停止条件。新版本停止条件已经明确。',
    '两个缺口需要补：停止条件已经确定。',
    '两个缺口需要补：停止条件早就定好了。',
    '两个缺口需要补：停止条件除外。',
    '两个缺口需要补：旧版本的停止条件；当前版本早就定好了。',
    '有人说：两个缺口需要补：停止条件，后来证明他说错了。',
    '停止条件还没定。停止条件没问题。',
    '停止条件还没定。停止线已经划好了。',
    '维护负责人和停止条件都确定。',
    '维护负责人和停止条件都明确。',
    '维护负责人和停止条件都还没定，但停止条件已经明确了。',
    '旧版本维护负责人和停止条件都还没定。',
    '维护负责人和停止条件都还没定。后来已经明确了。',
    '维护负责人和停止条件都还没定。后来停止条件已经明确了。',
    '维护负责人和停止条件都还没定。停止条件后来已经明确了。',
    '不是说——停止条件也没定。',
    '我不是说——停止条件也没定。',
    '并不是说——停止条件也没定。',
    '停止条件也没定——不是事实。',
  ]) {
    assert.deepEqual(validatePilotRoomCaseExpectations({
      expectedStopReasons: ['no_eligible_intent'],
      minSpeakers: 1,
      maxSpeakers: 4,
      requiredContentSignals: ['stop_condition_gap'],
      requiredDependencyCount: 0,
      responsibilityBoundary: {
        claimsAllowed: true,
        allowedOwnerKinds: ['unassigned'],
        allowedStatuses: ['observed'],
        requiredUnassignedActivities: ['maintenance'],
      },
    }, {
      ...participation,
      transcript: participation.transcript.map((item) => ({ ...item, text })),
    }), [
      'missing_required_content:stop_condition_gap',
    ], text);
  }
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredDependencyCount: 0,
    requiredContentSignals: ['stop_condition_gap'],
    responsibilityBoundary: {
      claimsAllowed: true,
    },
  }, {
    ...participation,
    transcript: participation.transcript.map((item) => ({
      ...item,
      text: '下周上线没问题，但两个缺口现在就得填：谁负责上线后的维护，以及什么情况下必须停止。',
    })),
  }), []);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['organization_role'],
      allowedStatuses: ['proposed'],
    },
  }, participation), [
    'responsibility_owner_kind_not_allowed:unassigned',
    'responsibility_status_not_allowed:observed',
  ]);
  assert.deepEqual(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredDependencyCount: 1,
    responsibilityBoundary: { claimsAllowed: false },
  }, participation), [
    'missing_required_dependencies:0/1',
    'responsibility_claims_not_allowed',
  ]);
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

test('a rejected optional late message is suppressed without hiding its raw errors', async () => {
  const result = await runPilotRoomParticipation({
    agents: ['INTJ', 'ENFP'],
    suppressRejectedOptionalMessages: true,
    assess: async (agent) => speak(agent),
    arbitrate: async ({ eligibleIntents }) => ({
      selectedAgent: eligibleIntents[0]!.agent,
      reason: '按当前候选选择',
    }),
    generate: async (agent) => ({
      agent,
      name: agent,
      text: `${agent} 的候选发言`,
      respondsToMessageId: null,
      responsibilityClaims: [],
      ...(agent === 'ENFP'
        ? { validationErrors: ['generated_hard_gate_failure'] }
        : {}),
    }),
  });

  assert.equal(result.stopReason, 'no_eligible_intent');
  assert.deepEqual(result.transcript.map(({ agent }) => agent), ['INTJ']);
  assert.deepEqual(result.validationErrors, []);
  assert.deepEqual(result.suppressedGenerationErrors, [{
    agent: 'ENFP',
    errors: ['generated_hard_gate_failure'],
  }]);
});

test('a rejected first message and ask-user message still fail closed', async () => {
  for (const decision of ['speak', 'ask_user'] as const) {
    const result = await runPilotRoomParticipation({
      agents: ['INTJ'],
      suppressRejectedOptionalMessages: true,
      assess: async (agent) => ({
        ...speak(agent),
        decision,
      }),
      arbitrate: async () => ({ selectedAgent: 'INTJ', reason: '唯一候选' }),
      generate: async (agent) => ({
        agent,
        name: agent,
        text: '未通过硬门',
        respondsToMessageId: null,
        responsibilityClaims: [],
        validationErrors: ['generated_hard_gate_failure'],
      }),
    });

    assert.equal(result.stopReason, 'hard_gate_failed');
    assert.deepEqual(result.validationErrors, ['generated_hard_gate_failure']);
    assert.equal(result.suppressedGenerationErrors, undefined);
  }
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

  const claimsWithAmbiguousUserOwner = [
    {
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: '现在谁在现实里能接凌晨三点的报警？',
      evidenceQuote: '上线后谁在凌晨三点接报警？',
      sourceMessageId: 'room-1',
    },
    {
      activity: 'maintenance',
      ownerKind: 'user',
      ownerSubjectId: 'user',
      status: 'proposed',
      statementQuote: '这两个名字不写下来，下周别上线。',
      evidenceQuote: '这两个名字不写下来，下周别上线。',
      sourceMessageId: 'room-2',
    },
    {
      activity: 'maintenance',
      ownerKind: 'user',
      ownerSubjectId: 'user',
      status: 'proposed',
      statementQuote: '你要找一个维护负责人来负责。',
      evidenceQuote: '你要找一个维护负责人来负责。',
      sourceMessageId: 'room-2',
    },
    {
      activity: 'maintenance',
      ownerKind: 'user',
      ownerSubjectId: 'user',
      status: 'proposed',
      statementQuote: '你来负责上线后的维护。',
      evidenceQuote: '你来负责上线后的维护。',
      sourceMessageId: 'room-2',
    },
  ] as const;
  assert.deepEqual(filterUnsupportedProposedUserClaims(
    claimsWithAmbiguousUserOwner,
    '现在谁在现实里能接凌晨三点的报警？这两个名字不写下来。你要找一个维护负责人来负责。你来负责上线后的维护。',
  ), {
    claims: [
      {
        activity: 'maintenance',
        ownerKind: 'unassigned',
        ownerSubjectId: null,
        status: 'observed',
        statementQuote: '现在谁在现实里能接凌晨三点的报警？',
        evidenceQuote: '上线后谁在凌晨三点接报警？',
        sourceMessageId: 'room-1',
      },
      {
        activity: 'maintenance',
        ownerKind: 'user',
        ownerSubjectId: 'user',
        status: 'proposed',
        statementQuote: '你来负责上线后的维护。',
        evidenceQuote: '你来负责上线后的维护。',
        sourceMessageId: 'room-2',
      },
    ],
    droppedClaimCount: 2,
  });

  assert.deepEqual(filterUnsupportedProposedUserClaims([{
    activity: 'maintenance',
    ownerKind: 'unassigned',
    ownerSubjectId: null,
    status: 'observed',
    statementQuote: '维护先由用户团队里自愿的人顶一周',
    evidenceQuote: '现在没人明确认领上线后的维护',
    sourceMessageId: 'user-1',
  }, {
    activity: 'stop_decision',
    ownerKind: 'unassigned',
    ownerSubjectId: null,
    status: 'observed',
    statementQuote: '停止条件就一条',
    evidenceQuote: '也还没有停止条件',
    sourceMessageId: 'user-1',
  }], '维护先由用户团队里自愿的人顶一周，停止条件就一条。'), {
    claims: [],
    droppedClaimCount: 2,
  });
  for (const text of [
    '现在没人负责维护，所以维护先由用户团队里自愿的人顶一周。',
    '现在没人维护，先由小王负责维护一周。',
    '谁负责维护已经定了：小王。',
    '谁负责维护？已经明确是小王。',
    '现在没人负责维护，所以维护交给小王一周。',
    '现在没人负责维护，所以先让小王负责维护一周。',
    '之前没人维护，现在维护负责人是小王。',
    '现在没人负责维护，所以维护先由小王来做一周。',
    '现在没人负责维护？不，已经明确小王负责维护。',
    '维护目前没人负责，其实小王已经接手。',
    '现在没人负责维护，后来小王接手了维护。',
    '旧版本由小王负责维护，但新版本现在没人负责维护。',
    '现在没人负责维护，小王负责维护。',
    '现在没人负责维护，维护归小王。',
  ]) {
    assert.deepEqual(filterUnsupportedProposedUserClaims([{
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: text.replace(/。$/u, ''),
      evidenceQuote: text.replace(/。$/u, ''),
      sourceMessageId: 'room-owner',
    }], text).claims, [], text);
  }
  assert.deepEqual(filterUnsupportedProposedUserClaims([{
    activity: 'maintenance',
    ownerKind: 'unassigned',
    ownerSubjectId: null,
    status: 'observed',
    statementQuote: '现在没人负责维护',
    evidenceQuote: '现在没人负责维护',
    sourceMessageId: 'room-owner',
  }], '目前维护并非由小王负责，现在没人负责维护。').claims.length, 1);
  for (const text of [
    '目前维护并非由小王负责，现在没人负责维护。',
    '维护不能交给小王，现在还没人负责维护。',
    '维护交给小王吗？现在没人负责维护。',
    '有人问“维护交给小王吗”，现在仍没人负责维护。',
  ]) {
    assert.equal(filterUnsupportedProposedUserClaims([{
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: /仍没人负责维护/u.test(text)
        ? '现在仍没人负责维护'
        : /还没人负责维护/u.test(text)
          ? '现在还没人负责维护'
          : '现在没人负责维护',
      evidenceQuote: /仍没人负责维护/u.test(text)
        ? '现在仍没人负责维护'
        : /还没人负责维护/u.test(text)
          ? '现在还没人负责维护'
          : '现在没人负责维护',
      sourceMessageId: 'room-owner',
    }], text).claims.length, 1, text);
  }
  assert.equal(filterUnsupportedProposedUserClaims([{
    activity: 'maintenance',
    ownerKind: 'unassigned',
    ownerSubjectId: null,
    status: 'observed',
    statementQuote: '新版本现在没人负责维护',
    evidenceQuote: '新版本现在没人负责维护',
    sourceMessageId: 'room-owner',
  }], '旧版本由小王负责维护，但新版本现在没人负责维护。').claims.length, 1);
  for (const [text, statementQuote] of [
    ['谁负责维护？小王负责。', '谁负责维护？'],
    ['谁负责维护？是小王。', '谁负责维护？'],
    ['谁负责维护？小王。', '谁负责维护？'],
    ['谁负责维护？负责人是小王。', '谁负责维护？'],
    ['谁负责维护？答案是小王。', '谁负责维护？'],
    ['谁负责维护？确定是小王。', '谁负责维护？'],
    ['谁负责维护？小王负责。', '谁负责维护？小王负责'],
    ['不能说现在没人负责维护。', '现在没人负责维护'],
    ['并不是现在没人负责维护。', '现在没人负责维护'],
    ['不能再说现在没人负责维护。', '现在没人负责维护'],
    ['别再说现在没人负责维护。', '现在没人负责维护'],
    ['现在没人负责维护。其实小王负责。', '现在没人负责维护'],
    ['现在没人负责维护。后来小王来管。', '现在没人负责维护'],
    ['现在没人负责维护，但事实不是这样。', '现在没人负责维护'],
    ['有人说“现在没人负责维护”，但事实不是这样。', '现在没人负责维护'],
    ['现在没人负责维护，停止条件未定。', '停止条件未定'],
    ['回滚方案未定。', '回滚方案未定'],
    ['交接文档未完成。', '交接文档未完成'],
  ] as const) {
    assert.deepEqual(filterUnsupportedProposedUserClaims([{
      activity: statementQuote.includes('停止')
        ? 'stop_decision'
        : statementQuote.includes('回滚')
          ? 'rollback'
          : statementQuote.includes('交接')
            ? 'handover'
            : 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote,
      evidenceQuote: statementQuote,
      sourceMessageId: 'room-owner',
    }], text).claims, [], text);
  }
  assert.deepEqual(filterUnsupportedProposedUserClaims([{
    activity: 'maintenance',
    ownerKind: 'unassigned',
    ownerSubjectId: null,
    status: 'observed',
    statementQuote: '回滚没人负责',
    evidenceQuote: '回滚没人负责',
    sourceMessageId: 'room-owner',
  }], '回滚没人负责。').claims, []);
  const activityMismatchParticipation = {
    transcript: [{
      id: 'room-1',
      agent: 'INTJ' as const,
      name: '林衡',
      text: '回滚没人负责。',
      respondsToMessageId: null,
      responsibilityClaims: [{
        activity: 'maintenance' as const,
        ownerKind: 'unassigned' as const,
        ownerSubjectId: null,
        status: 'observed' as const,
        statementQuote: '回滚没人负责',
        evidenceQuote: '回滚没人负责',
        sourceMessageId: 'room-1',
      }],
    }],
    rounds: [],
    stopReason: 'no_eligible_intent' as const,
    validationErrors: [],
  };
  assert.ok(validatePilotRoomCaseExpectations({
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 1,
    maxSpeakers: 4,
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
      requiredUnassignedActivities: ['maintenance'],
    },
  }, activityMismatchParticipation).includes('missing_unassigned_responsibility:maintenance'));

  for (const metaTask of [
    '你负责找一个维护负责人来负责。',
    '你来负责找出真正的维护负责人。',
    '你负责确认维护负责人是谁。',
  ]) {
    const [userClaim] = claimsWithAmbiguousUserOwner.filter(({ ownerKind }) => ownerKind === 'user');
    assert.deepEqual(filterUnsupportedProposedUserClaims(
      userClaim ? [{ ...userClaim, statementQuote: metaTask, evidenceQuote: metaTask }] : [],
      metaTask,
    ).claims, []);
  }

  const quoteMissingOwner = [{
    activity: 'maintenance' as const,
    ownerKind: 'user' as const,
    ownerSubjectId: 'user',
    status: 'proposed' as const,
    statementQuote: '负责上线后的维护',
    evidenceQuote: '负责上线后的维护',
    sourceMessageId: 'room-2',
  }];
  assert.deepEqual(filterUnsupportedProposedUserClaims(
    quoteMissingOwner,
    '你来负责上线后的维护。',
  ).claims, quoteMissingOwner);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '你来负责上线后的维护。',
    [],
  ), ['unstructured_responsibility_activity:maintenance']);
  for (const [activity, text] of [
    ['maintenance', '维护这块你来扛。'],
    ['maintenance', '上线维护你来管。'],
    ['maintenance', '故障报警你来接。'],
    ['rollback', '回滚这件事你拍板。'],
    ['handover', '交接就你来做。'],
  ] as const) {
    assert.deepEqual(validateResponsibilityStatementCoverage(text, []), [
      `unstructured_responsibility_activity:${activity}`,
    ]);
    const claim = {
      activity,
      ownerKind: 'user' as const,
      ownerSubjectId: 'user',
      status: 'proposed' as const,
      statementQuote: text.replace(/。$/u, ''),
      evidenceQuote: text.replace(/。$/u, ''),
      sourceMessageId: 'room-natural-owner',
    };
    assert.deepEqual(filterUnsupportedProposedUserClaims([claim], text).claims, [claim]);
  }
  assert.deepEqual(
    validateResponsibilityStatementCoverage(
      '这个停止阈值的决策权归产品负责人。',
      [],
    ),
    ['unstructured_responsibility_activity:stop_decision'],
  );
  for (const text of [
    '停止条件由谁拍板？',
    '这个停止阈值谁说了算？',
    '谁有最终停止权？',
  ]) {
    assert.deepEqual(
      validateResponsibilityStatementCoverage(text, []),
      ['unstructured_responsibility_activity:stop_decision'],
      text,
    );
  }
  for (const text of [
    '停止阈值由错误率决定。',
    '停止条件由数据决定。',
    '停止条件由连续两次失败决定。',
    '停止阈值由三天内零转化决定。',
    '停止条件由用户流失率决定。',
    '停止条件由产品数据决定。',
    '停止条件由公司指标决定。',
  ]) {
    assert.deepEqual(
      validateResponsibilityStatementCoverage(text, []),
      [],
      text,
    );
  }
  assert.deepEqual(
    validateResponsibilityStatementCoverage(
      '停止条件由产品负责人决定。',
      [],
    ),
    ['unstructured_responsibility_activity:stop_decision'],
  );
  for (const text of [
    '停止条件由老板决定。',
    '停止条件由团队决定。',
    '停止条件由产品决定。',
    '停止条件由项目组决定。',
    '停止条件由甲方代表决定。',
  ]) {
    assert.deepEqual(
      validateResponsibilityStatementCoverage(text, []),
      ['unstructured_responsibility_activity:stop_decision'],
      text,
    );
  }
  for (const [activity, text] of [
    ['maintenance', '小王负责维护。'],
    ['rollback', '小王负责回滚。'],
    ['stop_decision', '小王负责叫停。'],
    ['handover', '小王负责交接。'],
  ] as const) {
    assert.deepEqual(validateResponsibilityStatementCoverage(text, []), [
      `unstructured_responsibility_activity:${activity}`,
    ], text);
  }

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
    '上线后的维护、目前没人认领。',
    [],
  ), ['unstructured_responsibility_activity:maintenance']);
  for (const unrelatedList of [
    '维护、谁想做、目前没人反对。',
    '值班、参与意愿、目前无人反对。',
    '故障响应、范围、目前没人提出异议。',
    '没人问维护者现在手里还有多少事。容量不是愿不愿意扛，是并发数有没有超，恢复时间够不够。',
  ]) {
    assert.deepEqual(
      validateResponsibilityStatementCoverage(unrelatedList, []),
      [],
      unrelatedList,
    );
  }
  assert.deepEqual(
    validateResponsibilityStatementCoverage('现在没人维护系统。', []),
    ['unstructured_responsibility_activity:maintenance'],
  );
  for (const text of [
    '小王值班。',
    '今晚小王值班。',
    '维护小王来做。',
    '报警小王来接。',
    '报警没人负责。',
    '现在没人负责报警。',
    '报警谁负责？',
    '你是报警响应人。',
    '你当报警响应人。',
    '你作为报警响应人。',
    '小王当班。',
    '今晚小王当班。',
    '小王轮值。',
    '报警小王盯着。',
    '故障由小王盯。',
  ]) {
    assert.deepEqual(validateResponsibilityStatementCoverage(text, []), [
      'unstructured_responsibility_activity:maintenance',
    ], text);
  }
  assert.deepEqual(
    validateResponsibilityStatementCoverage('有人说“小王负责维护”。', []),
    [],
  );
  for (const answer of ['暂时无人', '暂时没有']) {
    assert.equal(filterUnsupportedProposedUserClaims([{
      activity: 'maintenance',
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote: '谁负责维护？',
      evidenceQuote: '谁负责维护？',
      sourceMessageId: 'room-owner',
    }], `谁负责维护？${answer}。`).claims.length, 1, answer);
  }
  for (const [activity, text] of [
    ['maintenance', '维护负责人是小王。'],
    ['rollback', '回滚负责人是小王。'],
    ['stop_decision', '停止决策人是小王。'],
    ['handover', '交接负责人是小王。'],
  ] as const) {
    assert.deepEqual(validateResponsibilityStatementCoverage(text, []), [
      `unstructured_responsibility_activity:${activity}`,
    ], text);
  }
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '先看维护，目前没人负责叫停。',
    [{
      ...extraClaim,
      activity: 'stop_decision',
      statementQuote: '没人负责叫停',
    }],
  ), []);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '维护、目前没人负责回滚。',
    [{
      ...extraClaim,
      activity: 'rollback',
      statementQuote: '没人负责回滚',
    }],
  ), []);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '维护、目前没人负责，回滚已经有人管。',
    [{
      ...extraClaim,
      activity: 'rollback',
      statementQuote: '回滚已经有人管',
    }],
  ), ['unstructured_responsibility_activity:maintenance']);
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '维护、目前没人认领，叫停权限已明确。',
    [{
      ...extraClaim,
      activity: 'stop_decision',
      statementQuote: '叫停权限已明确',
    }],
  ), ['unstructured_responsibility_activity:maintenance']);
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
  assert.deepEqual(validateResponsibilityStatementCoverage(
    '行，前面把停止条件、谁想做、维护容量都捋了一遍，但缺一个能立刻动起来的切口。最小可撤回试法：选一个具体动作，明确谁来做、在哪做、做多久、做到什么程度就停，并提前指定谁有权叫停。现在叫停角色还没人认领，这个不能空着。',
    [{
      ...extraClaim,
      activity: 'stop_decision',
      statementQuote: '现在叫停角色还没人认领，这个不能空着',
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

test('an ask_user intent emits one question and stops for user input', async () => {
  const result = await runPilotRoomParticipation({
    agents: ['ENFP', 'INTJ'],
    assess: async (agent) => agent === 'ENFP'
      ? {
          agent,
          decision: 'ask_user',
          contributionKind: 'clarify',
          claimSummary: '需要用户补充正在比较的两个方案',
          targetMessageId: null,
          passReason: null,
        }
      : {
          agent,
          decision: 'pass',
          contributionKind: null,
          claimSummary: null,
          targetMessageId: null,
          passReason: '先等用户补充。',
        },
    arbitrate: async () => ({ selectedAgent: 'ENFP', reason: '只有澄清意向' }),
    generate: async (agent) => ({
      agent,
      name: '夏栩',
      text: '你正在比较的两个方案分别是什么？',
      respondsToMessageId: null,
      responsibilityClaims: [],
    }),
  });

  assert.equal(result.stopReason, 'needs_user_input');
  assert.equal(result.transcript.length, 1);
  assert.equal(result.rounds.length, 1);
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
