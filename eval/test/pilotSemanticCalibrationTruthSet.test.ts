import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeHistoricalEvidence,
  isHistoricalClaimSupported,
} from '@persona16/engine/historical-evidence';
import {
  compileSemanticTurnControl,
  validateSemanticTurnDelivery,
} from '@persona16/engine/semantic-turn-control';
import {
  HISTORICAL_EVIDENCE_MINIMAL_PAIRS,
  SEMANTIC_BLOCKING_MINIMAL_PAIRS,
  SEMANTIC_DELIVERY_TRUTH_SET,
  type SemanticCalibrationPlanKind,
} from '../src/pilotSemanticCalibrationTruthSet';

const honestPreference = {
  memoryEnabled: true,
  climate: 'warm' as const,
  evidence: [{
    id: 'preference:honest',
    kind: 'preference' as const,
    content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
    traceability: 'traceable' as const,
    sourceEventId: 'honest',
    sourceEventType: 'preference_stated' as const,
  }],
};

function controlFor(
  kind: SemanticCalibrationPlanKind,
  allowedHistoricalEvidence: readonly string[] = [],
) {
  if (kind === 'boundary_repair') {
    return compileSemanticTurnControl({
      userMessage: allowedHistoricalEvidence.join('\n')
        || '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？',
    });
  }
  if (kind === 'correction') {
    return compileSemanticTurnControl({
      userMessage: '你理解错了。我不是害怕失败，也不是缺行动力；我只是根本不想再替所有人收拾残局。',
      relationshipContext: honestPreference,
      relationshipFocus: 'conflict',
    });
  }
  if (kind === 'responsibility') {
    return compileSemanticTurnControl({
      userMessage: '房间里还没有确认现实项目由谁收尾。',
      responseContract: {
        userCommitments: ['现实收尾责任尚未确认'],
        requiredMoves: ['只指出责任缺口'],
        allowedMoves: ['请求用户确认现实负责人'],
        forbiddenMoves: ['不得指定人物负责现实责任'],
      },
      relationshipFocus: 'room',
    });
  }
  return compileSemanticTurnControl({
    userMessage: '我现在不想听建议，也不想被分析，你就听我说一会儿。',
  });
}

test('human delivery labels, not an LLM judge, calibrate blocking and quality findings', () => {
  for (const truth of SEMANTIC_DELIVERY_TRUTH_SET) {
    const validation = validateSemanticTurnDelivery(
      truth.response,
      controlFor(truth.planKind, truth.allowedHistoricalEvidence).plan,
    );
    assert.deepEqual(
      validation.blockingViolations.map(({ code }) => code).sort(),
      [...truth.expectedBlockingCodes].sort(),
      truth.id,
    );
    assert.deepEqual(
      validation.qualityObservations.map(({ code }) => code).sort(),
      [...truth.expectedQualityCodes].sort(),
      truth.id,
    );
    assert.equal(
      validation.blockingViolations.length === 0,
      truth.allowedForFinalDelivery,
      truth.id,
    );
  }
});

test('every blocking code has a human-fixed positive and negative minimal pair', () => {
  const allBlockingCodes = [
    'forbidden_directional_question',
    'forbidden_advice',
    'forbidden_menu',
    'forbidden_justification',
    'decision_reopened',
    'required_semantic_move_missing',
    'unsupported_shared_history',
    'responsibility_owner_unconfirmed',
  ] as const;
  assert.deepEqual(
    [...new Set(SEMANTIC_BLOCKING_MINIMAL_PAIRS.map((pair) => (
      pair.targetBlockingCode
    )))].sort(),
    [...allBlockingCodes].sort(),
  );

  for (const pair of SEMANTIC_BLOCKING_MINIMAL_PAIRS) {
    const plan = controlFor(
      pair.planKind,
      pair.allowedHistoricalEvidence,
    ).plan;
    assert.deepEqual(
      validateSemanticTurnDelivery(
        pair.allowedResponse,
        plan,
      ).blockingViolations,
      [],
      `${pair.pairId}:allowed`,
    );
    assert.ok(
      validateSemanticTurnDelivery(
        pair.blockedResponse,
        plan,
      ).blockingViolations.some(({ code }) => code === pair.targetBlockingCode),
      `${pair.pairId}:blocked`,
    );
  }
});

test('historical minimal pairs fail when only time, negation, speaker, or action object changes', () => {
  for (const truth of HISTORICAL_EVIDENCE_MINIMAL_PAIRS) {
    const sourceClaims = analyzeHistoricalEvidence(
      truth.sourceText,
      'user_message',
    ).claims;
    const candidate = analyzeHistoricalEvidence(
      truth.candidateText,
      'persona_reply',
    ).claims[0];
    assert.ok(candidate, truth.id);
    assert.equal(
      isHistoricalClaimSupported(candidate, sourceClaims),
      truth.expectedSupported,
      truth.id,
    );
  }
});
