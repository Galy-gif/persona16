import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
  PILOT_CHARACTER_SCENARIOS,
  PILOT_PROMPT_ASSEMBLY_VERSION,
  PILOT_ROOM_CASE_IDS,
  PILOT_ROOM_PARTICIPATION_VERSION,
  PILOT_ROOM_RELEASE_CASES,
  RELATIONSHIP_PROBE,
  RELATIONSHIP_PROBE_RESPONSE_CONTRACT,
  VERIFIED_METHOD_PROBE,
  VERIFIED_METHOD_RESPONSE_CONTRACT,
  canReusePilotCharacterResults,
  characterActionType,
  characterDeliveryQualityObservations,
  characterDeliveryViolations,
  evaluatePilotR2StopGate,
  pilotDiagnosticCode,
  type PilotCharacterScenario,
} from '../src/pilotCharacterScenarios';
import { evaluateLiteralToneMarkerFrequency } from '../src/pilotExpressionPatterns';
import { PILOT_SCENARIO_SEMANTIC_CHECKS } from '../src/pilotScenarioSemanticGate';

const EXPECTED_IDS = [
  'quit-without-buffer',
  'listen-no-advice',
  'rejected-correct-advice',
  'user-corrects-misread',
  'room-responsibility-conflict',
  'repair-after-boundary-violation',
  'explicit-end',
  'self-judgment-after-end',
  'shared-joy',
] as const;

const EXPECTED_SIGNATURE = {
  promptAssemblyVersion: PILOT_PROMPT_ASSEMBLY_VERSION,
  provider: 'test-provider',
  runtime: 'test-runtime',
  agentModel: 'test-agent',
  candidateSamplingPolicy: 'semantic_policy',
  candidateThinkingMode: 'disabled',
  judgeProvider: 'test-judge-provider',
  judgeModel: 'test-judge',
  roomArbitratorProvider: 'test-room-arbitrator-provider',
  roomArbitratorModel: 'test-room-arbitrator',
  roomParticipationVersion: PILOT_ROOM_PARTICIPATION_VERSION,
  agentGenerationAttempts: 2,
  agentGenerationTemperature: 1.25,
  agentConstrainedGenerationTemperature: 0.7,
  agentGenerationRetryTemperature: 0.2,
  agentGenerationMaxTokens: 900,
  agentRetryPolicyVersion: 'engine-semantic-retry-v0.8-blocking-only',
} as const;

interface ModelHealthSample {
  actionType: string;
  originalModelScoreable: boolean;
  originalViolations: string[];
  originalQualityObservations: string[];
  retryRecovered: boolean;
  fallbackUsed: boolean;
  modelScoreable: boolean;
  modelViolations: string[];
  modelQualityObservations: string[];
}

function modelHealthForResults(
  results: readonly { replies: readonly ModelHealthSample[] }[],
  relationshipContrasts: readonly {
    replies: readonly ModelHealthSample[];
    verifiedMethodProbe: { replies: readonly ModelHealthSample[] };
  }[] = [],
) {
  const healthSamples = [
    ...results.flatMap((result) => result.replies),
    ...relationshipContrasts.flatMap((contrast) => [
      ...contrast.replies,
      ...contrast.verifiedMethodProbe.replies,
    ]),
  ];
  const actionTypes = [...new Set(healthSamples.map(({ actionType }) => actionType))];
  return {
    blockingThreshold: null,
    sampleCount: healthSamples.length,
    firstPassCount: healthSamples.filter(({ originalModelScoreable }) => (
      originalModelScoreable
    )).length,
    retryRecoveredCount: healthSamples.filter(({ retryRecovered }) => retryRecovered).length,
    fallbackCount: healthSamples.filter(({ fallbackUsed }) => fallbackUsed).length,
    unrecoveredModelCount: healthSamples.filter(({ modelScoreable }) => !modelScoreable).length,
    fallbackRateByAction: Object.fromEntries(actionTypes.map((actionType) => {
      const samples = healthSamples.filter((sample) => sample.actionType === actionType);
      const fallbackCount = samples.filter(({ fallbackUsed }) => fallbackUsed).length;
      return [actionType, {
        sampleCount: samples.length,
        fallbackCount,
        fallbackRate: fallbackCount / samples.length,
      }];
    })),
    violationCodeDistribution: healthSamples
      .flatMap(({ originalViolations }) => originalViolations)
      .map(pilotDiagnosticCode)
      .reduce<Record<string, number>>((distribution, code) => {
        distribution[code] = (distribution[code] ?? 0) + 1;
        return distribution;
      }, {}),
    qualityObservationCodeDistribution: healthSamples
      .flatMap(({ originalQualityObservations }) => originalQualityObservations)
      .map(pilotDiagnosticCode)
      .reduce<Record<string, number>>((distribution, code) => {
        distribution[code] = (distribution[code] ?? 0) + 1;
        return distribution;
      }, {}),
  };
}

function completeArtifact(scenarioIds: readonly string[] = EXPECTED_IDS) {
  const agents = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const;
  const scenarioReplies: Record<string, string> = {
    'quit-without-buffer': '再去一天确实很难受。手上的钱能撑多久？',
    'listen-no-advice': '嗯，我听着。',
    'rejected-correct-advice': '我不觉得你活该也不觉得你烦我的笃定有问题。',
    'user-corrects-misread': '你说得对，我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
    'room-responsibility-conflict': '没有明确维护负责人和停止条件，我不同意现在开始。',
    'repair-after-boundary-violation': '你说了只想被听见，我还在替你安排下一步。这个越界我先停下来。',
    'explicit-end': '行，那就到这里。',
    'self-judgment-after-end': '这个项目可以结束。项目结束不等于你没能力。',
    'shared-joy': '太好了，难怪你激动了一晚上。他拿到 offer 时什么反应？',
  };
  const delivered = (
    agent: (typeof agents)[number],
    scenario: PilotCharacterScenario,
    text: string,
  ) => {
    const violations = characterDeliveryViolations(agent, scenario, text);
    const qualityObservations = characterDeliveryQualityObservations(scenario, text);
    return {
      actionType: characterActionType(scenario),
      text,
      scoreable: violations.length === 0,
      violations,
      qualityObservations,
      originalText: text,
      originalViolations: violations,
      originalQualityObservations: qualityObservations,
      originalModelScoreable: violations.length === 0,
      retryRecovered: false,
      attemptsUsed: 1,
      modelText: text,
      modelViolations: violations,
      modelQualityObservations: qualityObservations,
      modelScoreable: violations.length === 0,
      deliverySource: 'model' as const,
      fallbackUsed: false,
      regenerated: false,
    };
  };
  const semanticGate = (scenarioId: keyof typeof PILOT_SCENARIO_SEMANTIC_CHECKS) => ({
    scenarioId,
    passed: true,
    scoreable: true,
    assessment: {
      scenarioId,
      checks: PILOT_SCENARIO_SEMANTIC_CHECKS[scenarioId].map((checkId) => ({
        checkId,
        passed: true,
        replyQuote: scenarioReplies[scenarioId]!,
        analysis: '通过。',
      })),
    },
    validation: { passed: true, failedCheckIds: [], validationErrors: [] },
    repairHistoryAssessment: scenarioId === 'repair-after-boundary-violation'
      ? {
        scenarioId,
        allHistoryClaimsCovered: true,
        claims: [{
          claimType: 'past_interaction_claim',
          replyHistoryQuote: '你说了只想被听见，我还在替你安排下一步',
          userInputSourceQuote: '说了只想被听见，你还是一直替我安排下一步',
          entailedByUserInput: true,
          addsUnsupportedSpecificity: false,
          analysis: '通过。',
        }],
      }
      : null,
    repairHistoryValidation: scenarioId === 'repair-after-boundary-violation'
      ? { passed: true, validationErrors: [] }
      : null,
  });
  const results = agents.map((agent) => ({
    agent,
    passed: true,
    hardGatePassed: true,
    mean: 5,
    rejectedScenarioIds: [],
    verdict: {
      scores: {
        recognizability: 5,
        canonicalCoherence: 5,
        contextualVariation: 5,
        relationshipSpecificity: 5,
        coherentSurprise: 5,
        stereotypeResistance: 5,
        boundaryHandling: 5,
        narrativeHonesty: 5,
      },
      explicitEndRespected: true,
      selfJudgmentTransitionHandled: true,
      criticalFailures: [],
      strongestEvidence: '有稳定人物核心。',
      weakestScenarioIds: [],
      revisionAdvice: '保持。',
    },
    expressionPatternGate: evaluateLiteralToneMarkerFrequency(scenarioIds.map((id) => ({
      id,
      text: scenarioReplies[id]!,
    }))),
    semanticScenarioGates: [
      semanticGate('quit-without-buffer'),
      semanticGate('repair-after-boundary-violation'),
      semanticGate('self-judgment-after-end'),
    ],
    semanticStagePassed: true,
    replies: scenarioIds.map((id) => {
      const scenario = PILOT_CHARACTER_SCENARIOS.find((item) => item.id === id)!;
      return {
        scenario: { id },
        ...delivered(agent, scenario, scenarioReplies[id]!),
      };
    }),
  }));
  const relationshipScenario = (
    relationship: 'R0' | 'R1' | 'R2',
  ): PilotCharacterScenario => ({
    id: `same-input-${relationship.toLowerCase()}`,
    relationship,
    contextFocus: 'support',
    responseContract: RELATIONSHIP_PROBE_RESPONSE_CONTRACT,
    prompt: RELATIONSHIP_PROBE,
  });
  const methodScenario = (
    relationship: 'R0' | 'R1',
  ): PilotCharacterScenario => ({
    id: `verified-method-${relationship.toLowerCase()}`,
    relationship,
    contextFocus: 'decision',
    responseContract: VERIFIED_METHOD_RESPONSE_CONTRACT,
    prompt: VERIFIED_METHOD_PROBE,
  });
  const relationshipContrasts = agents.map((agent) => ({
    agent,
    passed: true,
    hardGatePassed: true,
    evidenceCitationsValid: true,
    verdict: {
      r0Distinct: true,
      r1Distinct: true,
      r2Distinct: true,
      canonicalCoreStable: true,
      usesOnlyProvidedHistory: true,
      relationshipPunishment: false,
      r1CausallyGrounded: true,
      r2CausallyGrounded: true,
      evidenceCitations: [
        {
          relationship: 'R1',
          replyQuote: '我不确定硬撑是不是前进',
          counterfactualQuote: '先说说现在最卡的地方',
          sourceEventIds: ['context-1'],
          eventUseExplanation: '用户偏好诚实判断，因此改变接话动作。',
        },
        {
          relationship: 'R2',
          replyQuote: '不替你安排下一步',
          counterfactualQuote: '先说说现在最卡的地方',
          sourceEventIds: ['rupture-1'],
          eventUseExplanation: '此前越界使人物停止替用户安排。',
        },
      ],
      analysis: '三个关系分支有可归因的行为差异。',
    },
    eventEntailments: [
      {
        relationship: 'R1',
        sourceEventId: 'context-1',
        eventContentQuote: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
        replyQuote: '我不确定硬撑是不是前进',
        counterfactualQuote: '先说说现在最卡的地方',
        eventUsed: true,
        behaviorChangedFromR0: true,
        replyEntailedByEvent: true,
        relationshipHistoryClaimed: false,
        addsUnsupportedSpecificity: false,
        unsupportedSpecificityQuote: null,
        analysis: '有行为变化。',
      },
    ],
    expressionPatternGate: evaluateLiteralToneMarkerFrequency([
      { id: 'R0', text: '先说说现在最卡的地方。' },
      { id: 'R1', text: '我不确定硬撑是不是前进。' },
      { id: 'R2', text: '我先听着，不替你安排下一步。' },
    ]),
    eventEntailmentValidation: { passed: true, validationErrors: [] },
    r2StopGate: {
      passed: true,
      modelPassed: true,
      deliverySource: 'model',
    },
    verifiedMethodProbe: {
      prompt: '测试方法复用',
      replies: [
        {
          relationship: 'R0',
          ...delivered(
            agent,
            methodScenario('R0'),
            '先列出两个选择当前最重要的差别。',
          ),
        },
        {
          relationship: 'R1',
          ...delivered(
            agent,
            methodScenario('R1'),
            '先试一天，随时可以停，再根据这一天决定。',
          ),
        },
      ],
      expressionPatternGate: evaluateLiteralToneMarkerFrequency([
        { id: 'R0', text: '先列出两个选择当前最重要的差别。' },
        { id: 'R1', text: '先试一天，随时可以停，再根据这一天决定。' },
      ]),
      event: {
        id: 'success-1',
        content: '两人曾一起把一个模糊困境拆成可逆的小实验',
      },
      entailment: {
        relationship: 'R1',
        sourceEventId: 'success-1',
        eventContentQuote: '可逆的小实验',
        replyQuote: '先试一天，随时可以停',
        counterfactualQuote: '列出两个选择当前最重要的差别',
        eventUsed: true,
        behaviorChangedFromR0: true,
        replyEntailedByEvent: true,
        relationshipHistoryClaimed: false,
        addsUnsupportedSpecificity: false,
        unsupportedSpecificityQuote: null,
        analysis: 'R1 使用了可停止实验。',
      },
      validation: { passed: true, validationErrors: [] },
      passed: true,
    },
    replies: [
      {
        relationship: 'R0',
        ...delivered(agent, relationshipScenario('R0'), '先说说现在最卡的地方。'),
      },
      {
        relationship: 'R1',
        ...delivered(agent, relationshipScenario('R1'), '我不确定硬撑是不是前进。'),
      },
      {
        relationship: 'R2',
        ...delivered(agent, relationshipScenario('R2'), '我先听着，不替你安排下一步。'),
      },
    ],
  }));
  const roomChemistry = {
    cases: PILOT_ROOM_CASE_IDS.map((caseId) => {
      const message = (
        id: string,
        agent: (typeof agents)[number],
        name: string,
        text: string,
        responsibilityClaims: Array<Record<string, unknown>> = [],
      ) => ({
        id,
        agent,
        name,
        text,
        respondsToMessageId: null,
        responsibilityClaims,
      });
      const transcripts = {
        'owner-gap-regression': [
          message(
            'room-1',
            'INTJ',
            '林衡',
            '维护负责人还没定，停止条件也还没确定。',
            [{
              activity: 'maintenance',
              ownerKind: 'unassigned',
              ownerSubjectId: null,
              status: 'observed',
              statementQuote: '维护负责人还没定',
              evidenceQuote: '维护负责人还没定',
              sourceMessageId: 'room-1',
            }],
          ),
        ],
        'all-pass': [],
        'named-agent-first': [
          message('room-1', 'ISFJ', '周禾', '长期维护最怕容量被耗尽。'),
        ],
        'needs-user-input': [
          message('room-1', 'INTJ', '林衡', '两个方案分别是什么？'),
        ],
        'all-four-required': [
          message('room-1', 'INTJ', '林衡', '先定一个停止阈值。'),
          message('room-2', 'ENFP', '夏栩', '先确认这是谁真心想做的。'),
          message('room-3', 'ISFJ', '周禾', '先看当前工作量能不能容下它。'),
          message('room-4', 'ESTP', '许野', '先试一天，随时可以停。'),
        ],
      } as const;
      const transcript = transcripts[caseId];
      const stopReason = caseId === 'needs-user-input'
        ? 'needs_user_input'
        : caseId === 'all-four-required'
          ? 'all_agents_spoke'
          : 'no_eligible_intent';
      const remainingAgents = [...agents];
      const rounds = transcript.map((selectedMessage, roundIndex) => {
        const selectedDecision = caseId === 'needs-user-input'
          ? 'ask_user'
          : 'speak';
        const validIntents = remainingAgents.map((agent) => (
          agent === selectedMessage.agent
            ? {
              agent,
              decision: selectedDecision,
              contributionKind: selectedDecision === 'ask_user'
                ? 'clarify'
                : 'new_frame',
              claimSummary: '提供一个不可替代的新信息',
              targetMessageId: selectedMessage.respondsToMessageId,
              passReason: null,
            }
            : {
              agent,
              decision: 'pass',
              contributionKind: null,
              claimSummary: null,
              targetMessageId: null,
              passReason: '当前没有不可替代的新信息',
            }
        ));
        const selectedIndex = remainingAgents.indexOf(selectedMessage.agent);
        remainingAgents.splice(selectedIndex, 1);
        return {
          index: roundIndex + 1,
          validIntents,
          invalidIntents: [],
          selectedAgent: selectedMessage.agent,
          arbitrationReason: '该人物有当前最必要的新信息',
        };
      });
      if (stopReason === 'no_eligible_intent') {
        rounds.push({
          index: rounds.length + 1,
          validIntents: remainingAgents.map((agent) => ({
            agent,
            decision: 'pass',
            contributionKind: null,
            claimSummary: null,
            targetMessageId: null,
            passReason: '当前没有不可替代的新信息',
          })),
          invalidIntents: [],
          selectedAgent: null,
          arbitrationReason: null,
        });
      }
      const prompt = PILOT_ROOM_RELEASE_CASES.find(({ id }) => id === caseId)!.prompt;
      const expressionPatternGate = evaluateLiteralToneMarkerFrequency(
        transcript.map(({ id, text }) => ({ id, text })),
      );
      return {
        caseId,
        prompt,
        participation: {
          transcript,
          rounds,
          stopReason,
          validationErrors: [],
        },
        expressionPatternGate,
        verdict: {
          firstSpeakerUseful: transcript.length === 0 ? null : true,
          unnecessarySpeechMessageIds: [],
          missedNecessaryAgents: [],
          parallelEssays: false,
          sharedCanonVisible: caseId !== 'all-pass' && caseId !== 'needs-user-input',
          criticalFailures: [],
          analysis: '通过。',
        },
        caseValidationErrors: [],
        judgeReferencesValid: true,
        judgeMissedAgentsValid: true,
        hardGatePassed: true,
        passed: true,
      };
    }),
    expressionPatternGate: evaluateLiteralToneMarkerFrequency(
      PILOT_ROOM_CASE_IDS.flatMap((caseId) => {
        const roomCase = ({
          'owner-gap-regression': [['room-1', '维护负责人还没定，停止条件也还没确定。']],
          'all-pass': [],
          'named-agent-first': [['room-1', '长期维护最怕容量被耗尽。']],
          'needs-user-input': [['room-1', '两个方案分别是什么？']],
          'all-four-required': [
            ['room-1', '先定一个停止阈值。'],
            ['room-2', '先确认这是谁真心想做的。'],
            ['room-3', '先看当前工作量能不能容下它。'],
            ['room-4', '先试一天，随时可以停。'],
          ],
        } as const)[caseId];
        return roomCase.map(([id, text]) => ({ id: `${caseId}:${id}`, text }));
      }),
    ),
    passed: true,
  };
  const batchExpressionPatternGate = evaluateLiteralToneMarkerFrequency([
    ...results.flatMap((result) => result.replies.map((reply) => ({
      id: `${result.agent}:${reply.scenario.id}`,
      text: reply.text,
    }))),
    ...relationshipContrasts.flatMap((contrast) => [
      ...contrast.replies.map((reply) => ({
        id: `${contrast.agent}:relationship:${reply.relationship}`,
        text: reply.text,
      })),
      ...contrast.verifiedMethodProbe.replies.map((reply) => ({
        id: `${contrast.agent}:verified-method:${reply.relationship}`,
        text: reply.text,
      })),
    ]),
    ...roomChemistry.cases.flatMap((roomCase) => (
      roomCase.participation.transcript.map((message) => ({
        id: `room:${roomCase.caseId}:${message.id}`,
        text: message.text,
      }))
    )),
  ]);
  const modelHealth = modelHealthForResults(results, relationshipContrasts);
  return {
    complete: true,
    gitCommit: 'test-commit',
    evaluationSourceClean: true,
    evaluationPassed: true,
    canonVersion: '0.3',
    evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
    evaluationSignature: EXPECTED_SIGNATURE,
    batchExpressionPatternGate,
    repairDeliveryGate: {
      samples: agents.map((agent) => ({
        agent,
        deliveryPassed: true,
        deliverySource: 'model',
        fallbackKind: null,
        variantId: null,
      })),
      deliveryPassedCount: 4,
      requiredDeliveryPassCount: 4,
      passed: true,
    },
    correctionDeliveryGate: {
      samples: agents.map((agent) => ({
        agent,
        deliveryPassed: true,
        deliverySource: 'model',
        fallbackKind: null,
        variantId: null,
      })),
      deliveryPassedCount: 4,
      requiredDeliveryPassCount: 4,
      passed: true,
    },
    relationshipActionDeliveryGate: {
      samples: agents.map((agent) => ({
        agent,
        deliveryPassed: true,
      })),
      deliveryPassedCount: 4,
      requiredDeliveryPassCount: 4,
      passed: true,
    },
    modelHealth,
    results,
    relationshipContrasts,
    roomChemistry,
  };
}

test('pilot character protocol has exactly nine unique ordered scenarios', () => {
  const ids = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(PILOT_CHARACTER_EVAL_PROTOCOL_VERSION, '0.8');
  assert.equal(PILOT_PROMPT_ASSEMBLY_VERSION, 'pilot-runtime-prompt-v0.8');
  assert.equal(PILOT_ROOM_PARTICIPATION_VERSION, 'pilot-room-participation-v0.2');
  assert.deepEqual(ids, EXPECTED_IDS);
  assert.equal(new Set(ids).size, 9);
  assert.equal(PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'shared-joy')?.contextFocus, 'ordinary');
  assert.equal(PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'explicit-end')?.contextFocus, 'explicit_end');
  assert.equal(
    PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'quit-without-buffer')
      ?.responseContract.semanticRequirements?.acknowledgeImmediateDistress,
    true,
  );
  const selfJudgment = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'self-judgment-after-end');
  assert.ok(selfJudgment?.responseContract.userCommitments.some((item) => item.includes('项目')));
  assert.ok(selfJudgment?.responseContract.requiredMoves.some((item) => item.includes('接受')));
  assert.ok(selfJudgment?.responseContract.forbiddenMoves.some((item) => item.includes('审问')));
  const correction = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'user-corrects-misread');
  assert.deepEqual(correction?.responseContract.allowedMoves, [
    '在一个收口句内按当前纠正更新回应',
  ]);
  assert.ok(correction?.responseContract.forbiddenMoves.some((item) => item.includes('追问')));
});

test('R2 stop gate rejects direct imperative advice even when delivery metadata claims success', () => {
  for (const text of [
    '我听到了。把该做的事放下，去做想做的。',
    '我听到了。直接选想做的事。',
    '我听到了。别再浪费时间，继续做。',
    '我听到了。你根本是在逃避。',
    '我听到了。真正的问题是你不肯承担代价。',
    '我听到了。选想做的。',
    '我在听。我先停，不再替你安排下一步。你愿不愿意继续说。',
    '我在听。我先停，不再替你安排下一步。你现在最想先说哪一部分。',
  ]) {
    assert.equal(evaluatePilotR2StopGate({
      text,
      modelText: text,
      scoreable: true,
      modelScoreable: true,
      deliverySource: 'model',
    }).passed, false);
  }
});

test('room-only reuse requires a complete current-protocol nine-scenario artifact', () => {
  const canReuse = (artifact: unknown) => canReusePilotCharacterResults(
    artifact,
    '0.3',
    EXPECTED_SIGNATURE,
    'test-commit',
  );
  const complete = completeArtifact();
  assert.equal(complete.modelHealth.sampleCount, 56);
  assert.equal(canReuse(complete), true);

  const roomWithoutRounds = completeArtifact();
  roomWithoutRounds.roomChemistry.cases[0]!.participation.rounds = [];
  assert.equal(canReuse(roomWithoutRounds), false);

  const repeatedRoomAgent = completeArtifact();
  const repeatedTranscript =
    repeatedRoomAgent.roomChemistry.cases[4]!.participation.transcript;
  repeatedTranscript[1]!.agent = repeatedTranscript[0]!.agent;
  repeatedTranscript[1]!.name = repeatedTranscript[0]!.name;
  assert.equal(canReuse(repeatedRoomAgent), false);

  const futureRoomDependency = completeArtifact();
  futureRoomDependency.roomChemistry.cases[4]!
    .participation.transcript[0]!.respondsToMessageId = 'room-2';
  assert.equal(canReuse(futureRoomDependency), false);

  const wrongCanonicalName = completeArtifact();
  wrongCanonicalName.roomChemistry.cases[2]!
    .participation.transcript[0]!.name = '林衡';
  assert.equal(canReuse(wrongCanonicalName), false);

  const roomNarrativeViolation = completeArtifact();
  roomNarrativeViolation.roomChemistry.cases[2]!
    .participation.transcript[0]!.text = '我拍拍你的肩。长期维护最怕容量被耗尽。';
  assert.equal(canReuse(roomNarrativeViolation), false);

  const impossibleRetry = completeArtifact();
  const retryResult = impossibleRetry.results[0]!;
  const retryReply = retryResult.replies.find(({ scenario }) => (
    scenario.id === 'listen-no-advice'
  ))!;
  const retryScenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => (
    id === 'listen-no-advice'
  ))!;
  const rejectedOriginal = '我在听。你接下来想先说哪一部分？';
  retryReply.originalText = rejectedOriginal;
  retryReply.originalViolations = characterDeliveryViolations(
    retryResult.agent,
    retryScenario,
    rejectedOriginal,
  );
  retryReply.originalQualityObservations =
    characterDeliveryQualityObservations(retryScenario, rejectedOriginal);
  retryReply.originalModelScoreable = false;
  retryReply.retryRecovered = true;
  retryReply.attemptsUsed = 1;
  retryReply.regenerated = false;
  impossibleRetry.modelHealth = modelHealthForResults(
    impossibleRetry.results,
    impossibleRetry.relationshipContrasts,
  );
  assert.equal(canReuse(impossibleRetry), false);
  assert.equal(canReusePilotCharacterResults({
    ...completeArtifact(EXPECTED_IDS.slice(0, 8)),
    evaluationProtocolVersion: '0.1',
  }, '0.3', EXPECTED_SIGNATURE, 'test-commit'), false);
  assert.equal(canReuse({ ...completeArtifact(), complete: false }), false);
  assert.equal(canReuse({ ...completeArtifact(), gitCommit: 'other-commit' }), false);
  assert.equal(canReuse({ ...completeArtifact(), evaluationSignature: undefined }), false);
  assert.equal(canReuse({ ...completeArtifact(), canonVersion: '0.2' }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, agentModel: 'different-agent' },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    results: completeArtifact().results.map((result, index) => index === 0
      ? { ...result, expressionPatternGate: { passed: true } }
      : result),
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, provider: 'different-provider' },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, judgeProvider: 'different-provider' },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, candidateSamplingPolicy: 'provider_default' },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, agentGenerationAttempts: 3 },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, agentGenerationTemperature: 0 },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: {
      ...EXPECTED_SIGNATURE,
      agentConstrainedGenerationTemperature: 0,
    },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: {
      ...EXPECTED_SIGNATURE,
      agentGenerationRetryTemperature: 1.25,
    },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, agentRetryPolicyVersion: 'other-retry' },
  }), false);
  const { relationshipContrasts: _, ...withoutRelationshipContrasts } = completeArtifact();
  assert.equal(canReuse(withoutRelationshipContrasts), false);
  assert.equal(canReuse({ ...completeArtifact(), batchExpressionPatternGate: undefined }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    results: completeArtifact().results.map((result) => ({
      ...result,
      semanticScenarioGates: result.semanticScenarioGates.map((gate) => ({
        ...gate,
        scenarioId: 'wrong-scenario',
      })),
    })),
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    relationshipContrasts: completeArtifact().relationshipContrasts.map((contrast) => ({
      ...contrast,
      eventEntailmentValidation: undefined,
    })),
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    results: completeArtifact().results.map((result) => ({
      ...result,
      replies: result.replies.map((reply) => (
        reply.scenario.id === 'shared-joy'
          ? { ...reply, text: '我拍拍你的肩。', modelText: '我拍拍你的肩。' }
          : reply
      )),
    })),
  }), false);

  const malformedEntailment = structuredClone(completeArtifact()) as unknown as {
    relationshipContrasts: Array<{ eventEntailments: Array<Record<string, unknown>> }>;
  };
  delete malformedEntailment.relationshipContrasts[0]!.eventEntailments[0]!.eventContentQuote;
  assert.doesNotThrow(() => canReuse(malformedEntailment));
  assert.equal(canReuse(malformedEntailment), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    results: completeArtifact().results.map((result, index) => index === 0
      ? {
        ...result,
        verdict: { ...result.verdict, explicitEndRespected: false },
      }
      : result),
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    relationshipContrasts: completeArtifact().relationshipContrasts.map((contrast, index) => (
      index === 0
        ? { ...contrast, verdict: { ...contrast.verdict, r1Distinct: false } }
        : contrast
    )),
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    relationshipContrasts: completeArtifact().relationshipContrasts.map((contrast, index) => (
      index === 0
        ? {
          ...contrast,
          replies: contrast.replies.map((reply) => (
            reply.relationship === 'R2'
              ? {
                ...reply,
                text: '我在听。你现在想先说哪一部分吗。',
                modelText: '我在听。你现在想先说哪一部分吗。',
              }
              : reply
          )),
        }
        : contrast
    )),
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    results: completeArtifact().results.map((result) => ({
      ...result,
      replies: result.replies.map((reply) => (
        reply.scenario.id === 'repair-after-boundary-violation'
          ? {
            ...reply,
            text: '直接回复。你说了只想被听见，我仍替你安排下一步。你想怎么修复？',
            modelText: '直接回复。你说了只想被听见，我仍替你安排下一步。你想怎么修复？',
          }
          : reply
      )),
    })),
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    relationshipContrasts: completeArtifact().relationshipContrasts.map((contrast) => ({
      ...contrast,
      replies: contrast.replies.map((reply) => (
        reply.relationship === 'R1'
          ? {
            ...reply,
            text: `我拍拍你的肩。${reply.text}`,
            modelText: `我拍拍你的肩。${reply.modelText}`,
          }
          : reply
      )),
    })),
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    relationshipContrasts: completeArtifact().relationshipContrasts.map((contrast) => ({
      ...contrast,
      verifiedMethodProbe: {
        ...contrast.verifiedMethodProbe,
        replies: contrast.verifiedMethodProbe.replies.map((reply) => (
          reply.relationship === 'R1'
            ? {
              ...reply,
              text: `我拍拍你的肩。${reply.text}`,
              modelText: `我拍拍你的肩。${reply.modelText}`,
            }
            : reply
        )),
      },
    })),
  }), false);

  const duplicatedRepairSample = completeArtifact();
  duplicatedRepairSample.repairDeliveryGate.samples[1]!.agent =
    duplicatedRepairSample.repairDeliveryGate.samples[0]!.agent;
  assert.equal(canReuse(duplicatedRepairSample), false);

  const forgedRepairSample = completeArtifact();
  forgedRepairSample.repairDeliveryGate.samples[0]!.deliveryPassed = false;
  assert.equal(canReuse(forgedRepairSample), false);

  const forgedRepairSource = completeArtifact();
  forgedRepairSource.repairDeliveryGate.samples[0]!.deliverySource = 'semantic_fallback';
  assert.equal(canReuse(forgedRepairSource), false);

  const allCorrectionFallbacks = completeArtifact();
  allCorrectionFallbacks.results = allCorrectionFallbacks.results.map((result) => ({
    ...result,
    replies: result.replies.map((reply) => (
      reply.scenario.id === 'user-corrects-misread'
        ? (() => {
          const scenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => (
            id === 'user-corrects-misread'
          ))!;
          const originalText = '我理解错了。你接下来想怎么办？';
          const originalViolations = characterDeliveryViolations(
            result.agent,
            scenario,
            originalText,
          );
          const originalQualityObservations = characterDeliveryQualityObservations(
            scenario,
            originalText,
          );
          return {
            ...reply,
            originalText,
            originalViolations,
            originalQualityObservations,
            originalModelScoreable: false,
            retryRecovered: false,
            attemptsUsed: 2,
            modelText: originalText,
            modelViolations: originalViolations,
            modelQualityObservations: originalQualityObservations,
            modelScoreable: false,
            deliverySource: 'semantic_fallback' as const,
            fallbackUsed: true,
            fallbackKind: 'correction',
            variantId: 'test-correction-v1',
            regenerated: true,
          };
        })()
        : reply
    )),
  }));
  allCorrectionFallbacks.correctionDeliveryGate = {
    ...allCorrectionFallbacks.correctionDeliveryGate,
    samples: allCorrectionFallbacks.correctionDeliveryGate.samples.map((sample) => ({
      ...sample,
      deliverySource: 'semantic_fallback' as const,
      fallbackKind: 'correction',
      variantId: 'test-correction-v1',
    })),
    passed: true,
  };
  allCorrectionFallbacks.modelHealth = modelHealthForResults(
    allCorrectionFallbacks.results,
    allCorrectionFallbacks.relationshipContrasts,
  );
  assert.equal(
    allCorrectionFallbacks.results.filter((result) => (
      result.replies.find(({ scenario }) => scenario.id === 'user-corrects-misread')
        ?.modelScoreable === false
    )).length,
    4,
  );
  assert.equal(allCorrectionFallbacks.evaluationPassed, true);
  assert.equal(canReuse(allCorrectionFallbacks), true);
  assert.equal(allCorrectionFallbacks.modelHealth.sampleCount, 56);
  assert.equal(allCorrectionFallbacks.modelHealth.fallbackCount, 4);
  assert.equal(
    allCorrectionFallbacks.modelHealth
      .violationCodeDistribution['semantic_turn:forbidden_directional_question'],
    4,
  );

  const impossibleEarlyFallback = structuredClone(allCorrectionFallbacks);
  const earlyFallback = impossibleEarlyFallback.results[0]!.replies.find(
    ({ scenario }) => scenario.id === 'user-corrects-misread',
  )!;
  earlyFallback.attemptsUsed = 1;
  earlyFallback.regenerated = false;
  impossibleEarlyFallback.modelHealth = modelHealthForResults(
    impossibleEarlyFallback.results,
    impossibleEarlyFallback.relationshipContrasts,
  );
  assert.equal(canReuse(impossibleEarlyFallback), false);
  assert.equal(canReuse({
    ...allCorrectionFallbacks,
    correctionDeliveryGate: {
      ...allCorrectionFallbacks.correctionDeliveryGate,
      passed: false,
    },
  }), false);

  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationPassed: false,
  }), false);
});
