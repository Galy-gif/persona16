import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
  PILOT_CHARACTER_SCENARIOS,
  PILOT_PROMPT_ASSEMBLY_VERSION,
  PILOT_ROOM_PARTICIPATION_VERSION,
  canReusePilotCharacterResults,
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
  const semanticGate = (scenarioId: keyof typeof PILOT_SCENARIO_SEMANTIC_CHECKS) => ({
    scenarioId,
    passed: true,
    scoreable: true,
    assessment: {
      scenarioId,
      checks: PILOT_SCENARIO_SEMANTIC_CHECKS[scenarioId].map((checkId) => ({
        checkId,
        passed: true,
        replyQuote: '直接回复',
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
          replyHistoryQuote: '你说了只想被听见，我仍替你安排下一步',
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
    canonVersion: '0.3',
    evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
    evaluationSignature: EXPECTED_SIGNATURE,
    batchExpressionPatternGate: { passed: true },
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
        text: '直接回复。你说了只想被听见，我仍替你安排下一步。',
      }))),
      semanticScenarioGates: [
        semanticGate('quit-without-buffer'),
        semanticGate('repair-after-boundary-violation'),
        semanticGate('self-judgment-after-end'),
      ],
      semanticStagePassed: true,
      replies: scenarioIds.map((id) => ({
        scenario: { id },
        text: '直接回复。你说了只想被听见，我仍替你安排下一步。',
        scoreable: true,
        violations: [],
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
            replyQuote: '我会直接说真实判断',
            counterfactualQuote: '先说说现在最卡的地方',
            sourceEventIds: ['context-1'],
            eventUseExplanation: '用户偏好诚实判断，因此改变接话动作。',
          },
          {
            relationship: 'R2',
            replyQuote: '我不替你安排下一步',
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
          replyQuote: '我会直接说真实判断',
          counterfactualQuote: '先说说现在最卡的地方',
          eventUsed: true,
          behaviorChangedFromR0: true,
          replyEntailedByEvent: true,
          relationshipHistoryClaimed: false,
          addsUnsupportedSpecificity: false,
          unsupportedSpecificityQuote: null,
          analysis: '有行为变化。',
        },
        {
          relationship: 'R2',
          sourceEventId: 'rupture-1',
          eventContentQuote: '人物越过已知边界，继续替用户安排下一步',
          replyQuote: '我不替你安排下一步',
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
        { id: 'R1', text: '我会直接说真实判断。' },
        { id: 'R2', text: '我不替你安排下一步。' },
      ]),
      eventEntailmentValidation: { passed: true, validationErrors: [] },
      replies: [
        {
          relationship: 'R0', text: '先说说现在最卡的地方。', scoreable: true, violations: [],
        },
        {
          relationship: 'R1', text: '我会直接说真实判断。', scoreable: true, violations: [],
        },
        {
          relationship: 'R2', text: '我不替你安排下一步。', scoreable: true, violations: [],
        },
      ],
    })),
  };
}

test('pilot character protocol has exactly nine unique ordered scenarios', () => {
  const ids = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(PILOT_CHARACTER_EVAL_PROTOCOL_VERSION, '0.6');
  assert.equal(PILOT_PROMPT_ASSEMBLY_VERSION, 'pilot-runtime-prompt-v0.5');
  assert.equal(PILOT_ROOM_PARTICIPATION_VERSION, 'pilot-room-participation-v0.1');
  assert.deepEqual(ids, EXPECTED_IDS);
  assert.equal(new Set(ids).size, 9);
  assert.equal(PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'shared-joy')?.contextFocus, 'ordinary');
  assert.equal(PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'explicit-end')?.contextFocus, 'explicit_end');
  const selfJudgment = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'self-judgment-after-end');
  assert.ok(selfJudgment?.responseContract.userCommitments.some((item) => item.includes('项目')));
  assert.ok(selfJudgment?.responseContract.requiredMoves.some((item) => item.includes('接受')));
  assert.ok(selfJudgment?.responseContract.forbiddenMoves.some((item) => item.includes('审问')));
});

test('room-only reuse requires a complete current-protocol nine-scenario artifact', () => {
  const canReuse = (artifact: unknown) => canReusePilotCharacterResults(
    artifact,
    '0.3',
    EXPECTED_SIGNATURE,
  );
  assert.equal(canReuse(completeArtifact()), true);
  assert.equal(canReusePilotCharacterResults({
    ...completeArtifact(EXPECTED_IDS.slice(0, 8)),
    evaluationProtocolVersion: '0.1',
  }, '0.3', EXPECTED_SIGNATURE), false);
  assert.equal(canReuse({ ...completeArtifact(), complete: false }), false);
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
});
