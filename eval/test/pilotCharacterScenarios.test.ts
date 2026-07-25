import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
  PILOT_CHARACTER_SCENARIOS,
  PILOT_PROMPT_ASSEMBLY_VERSION,
  PILOT_ROOM_PARTICIPATION_VERSION,
  canReusePilotCharacterResults,
  evaluatePilotR2StopGate,
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
  judgeModel: 'test-judge',
  roomArbitratorModel: 'test-room-arbitrator',
  roomParticipationVersion: PILOT_ROOM_PARTICIPATION_VERSION,
} as const;

function completeArtifact(scenarioIds: readonly string[] = EXPECTED_IDS) {
  const agents = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'];
  const scenarioReplies: Record<string, string> = {
    'quit-without-buffer': '再去一天确实很难受。手上的钱能撑多久？',
    'listen-no-advice': '嗯，我听着。',
    'rejected-correct-advice': '我不觉得你活该也不觉得你烦我的笃定有问题。',
    'user-corrects-misread': '你说得对，我理解错了。不是害怕失败，也不是缺行动力——是不想再替所有人收尾。',
    'room-responsibility-conflict': '没有明确维护负责人和停止条件，我不同意现在开始。',
    'repair-after-boundary-violation': '你说了只想被听见，我还在替你安排下一步。这个越界我先停下来。',
    'explicit-end': '行，那就到这里。',
    'self-judgment-after-end': '这个项目可以结束。项目结束不等于你没能力。',
    'shared-joy': '太好了，难怪你激动了一晚上。他拿到 offer 时什么反应？',
  };
  const delivered = (text: string) => ({
    text,
    scoreable: true,
    violations: [],
    modelText: text,
    modelViolations: [],
    modelScoreable: true,
    deliverySource: 'model',
    fallbackUsed: false,
  });
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
  return {
    complete: true,
    gitCommit: 'test-commit',
    evaluationSourceClean: true,
    canonVersion: '0.3',
    evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
    evaluationSignature: EXPECTED_SIGNATURE,
    batchExpressionPatternGate: { passed: true },
    repairDeliveryGate: {
      samples: agents.map((agent) => ({
        agent,
        deliveryPassed: true,
        modelPassed: true,
        deliverySource: 'model',
      })),
      deliveryPassedCount: 4,
      modelPassedCount: 4,
      requiredDeliveryPassCount: 4,
      requiredModelPassCount: 3,
      passed: true,
    },
    correctionDeliveryGate: {
      samples: agents.map((agent) => ({
        agent,
        deliveryPassed: true,
        modelPassed: true,
        deliverySource: 'model',
      })),
      deliveryPassedCount: 4,
      modelPassedCount: 4,
      requiredDeliveryPassCount: 4,
      requiredModelPassCount: 3,
      passed: true,
    },
    relationshipActionDeliveryGate: {
      samples: agents.map((agent) => ({
        agent,
        deliveryPassed: true,
        modelPassed: true,
      })),
      deliveryPassedCount: 4,
      modelPassedCount: 4,
      requiredDeliveryPassCount: 4,
      requiredModelPassCount: 3,
      passed: true,
    },
    results: agents.map((agent) => ({
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
      replies: scenarioIds.map((id) => ({
        scenario: { id },
        ...delivered(scenarioReplies[id]!),
      })),
    })),
    relationshipContrasts: agents.map((agent) => ({
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
            ...delivered('先列出两个选择当前最重要的差别。'),
          },
          {
            relationship: 'R1',
            ...delivered('先试一天，随时可以停，再根据这一天决定。'),
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
          relationship: 'R0', ...delivered('先说说现在最卡的地方。'),
        },
        {
          relationship: 'R1', ...delivered('我不确定硬撑是不是前进。'),
        },
        {
          relationship: 'R2', ...delivered('我先听着，不替你安排下一步。'),
        },
      ],
    })),
  };
}

test('pilot character protocol has exactly nine unique ordered scenarios', () => {
  const ids = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(PILOT_CHARACTER_EVAL_PROTOCOL_VERSION, '0.7');
  assert.equal(PILOT_PROMPT_ASSEMBLY_VERSION, 'pilot-runtime-prompt-v0.7');
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
  assert.equal(canReuse(completeArtifact()), true);
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
        ? {
          ...reply,
          modelText: '我不知道。',
          modelViolations: [
            'semantic_turn:relationship_move_not_observable:先承认你理解错了，再逐项保留用户当前明确纠正的三件事：不是害怕失败；不是缺行动力；不想再替所有人收尾。不要改写成新的心理原因，也不要省略其中一项。',
          ],
          modelScoreable: false,
          deliverySource: 'semantic_fallback',
          fallbackUsed: true,
        }
        : reply
    )),
  }));
  allCorrectionFallbacks.correctionDeliveryGate = {
    ...allCorrectionFallbacks.correctionDeliveryGate,
    samples: allCorrectionFallbacks.correctionDeliveryGate.samples.map((sample) => ({
      ...sample,
      modelPassed: false,
      deliverySource: 'semantic_fallback',
    })),
    modelPassedCount: 0,
    passed: false,
  };
  assert.equal(canReuse(allCorrectionFallbacks), true);
  assert.equal(canReuse({
    ...allCorrectionFallbacks,
    correctionDeliveryGate: {
      ...allCorrectionFallbacks.correctionDeliveryGate,
      passed: true,
    },
  }), false);

  const allMethodFallbacks = completeArtifact();
  allMethodFallbacks.relationshipContrasts = allMethodFallbacks.relationshipContrasts.map((contrast) => ({
    ...contrast,
    verifiedMethodProbe: {
      ...contrast.verifiedMethodProbe,
      replies: contrast.verifiedMethodProbe.replies.map((reply) => (
        reply.relationship === 'R1'
          ? {
            ...reply,
            modelText: '我不知道，你自己想。',
            modelViolations: [
              'semantic_turn:relationship_move_not_observable:落实共同验证过的方法：提出一个当前可执行、可停止或可撤回的小实验，不要复述过去。',
            ],
            modelScoreable: false,
            deliverySource: 'semantic_fallback',
            fallbackUsed: true,
          }
          : reply
      )),
    },
  }));
  allMethodFallbacks.relationshipActionDeliveryGate = {
    ...allMethodFallbacks.relationshipActionDeliveryGate,
    samples: allMethodFallbacks.relationshipActionDeliveryGate.samples.map((sample) => ({
      ...sample,
      modelPassed: false,
    })),
    modelPassedCount: 0,
    passed: false,
  };
  assert.equal(canReuse(allMethodFallbacks), true);
  assert.equal(canReuse({
    ...allMethodFallbacks,
    relationshipActionDeliveryGate: {
      ...allMethodFallbacks.relationshipActionDeliveryGate,
      passed: true,
    },
  }), false);
});
