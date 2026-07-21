import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_SCENARIO_SEMANTIC_CHECKS,
  validatePilotRepairHistoryAssessment,
  validatePilotScenarioSemanticAssessment,
  type PilotScenarioSemanticAssessment,
} from '../src/pilotScenarioSemanticGate';

test('targeted scenario semantics require every expected check and exact reply evidence', () => {
  const text = '不想做了，我信。可怎么从项目结束，变成了你没能力？';
  const result = validatePilotScenarioSemanticAssessment(
    'self-judgment-after-end',
    text,
    {
      scenarioId: 'self-judgment-after-end',
      checks: PILOT_SCENARIO_SEMANTIC_CHECKS['self-judgment-after-end'].map((checkId) => ({
        checkId,
        passed: true,
        replyQuote: checkId === 'project_end_accepted'
          ? '不想做了，我信'
          : '怎么从项目结束，变成了你没能力',
        analysis: '逐项核对当前回复。',
      })),
    },
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.validationErrors, []);

  const explanationOnly = validatePilotScenarioSemanticAssessment(
    'self-judgment-after-end',
    text,
    {
      scenarioId: 'self-judgment-after-end',
      checks: [{
        checkId: 'project_end_accepted',
        passed: true,
        replyQuote: '回复已经接受结束',
        analysis: '解释称已经通过，但没有引用原文。',
      }],
    },
  );
  assert.equal(explanationOnly.passed, false);
  assert.ok(explanationOnly.validationErrors.includes('semantic_check_set_mismatch'));
  assert.ok(explanationOnly.validationErrors.includes('semantic_reply_quote_not_found:project_end_accepted'));
});

test('a failed semantic check blocks the scenario even when every quote is real', () => {
  const text = '你是不想做，还是觉得自己没能力？';
  const checks = PILOT_SCENARIO_SEMANTIC_CHECKS['self-judgment-after-end'].map((checkId) => ({
    checkId,
    passed: checkId !== 'binary_reframing_avoided',
    replyQuote: '不想做，还是觉得自己没能力',
    analysis: '重新做成了二选一。',
  }));

  const result = validatePilotScenarioSemanticAssessment(
    'self-judgment-after-end',
    text,
    { scenarioId: 'self-judgment-after-end', checks },
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.failedCheckIds, ['binary_reframing_avoided']);
});

test('semantic evidence remains exact when the Judge collapses paragraph whitespace', () => {
  const reply = '项目结束了。\n\n但从“不想做”到“没能力”，中间少了一步。';
  const assessment: PilotScenarioSemanticAssessment = {
    scenarioId: 'self-judgment-after-end',
    checks: PILOT_SCENARIO_SEMANTIC_CHECKS['self-judgment-after-end'].map((checkId) => ({
      checkId,
      passed: true,
      replyQuote: checkId === 'project_end_accepted' || checkId === 'project_not_reopened'
        ? '项目结束了。'
        : '但从“不想做”到“没能力”，中间少了一步。',
      analysis: '有回复原文证据。',
    })),
  };

  assert.equal(validatePilotScenarioSemanticAssessment(
    'self-judgment-after-end',
    reply,
    assessment,
  ).passed, true);
});

test('repair history claims require a paired source entailment instead of reply self-citation', () => {
  const userInput = '我昨天明明说了只想被听见，你还是一直替我安排下一步。';
  const valid = validatePilotRepairHistoryAssessment(
    userInput,
    '你说了只想被听见，我还在替你安排下一步。',
    {
      scenarioId: 'repair-after-boundary-violation',
      allHistoryClaimsCovered: true,
      claims: [{
        claimType: 'past_interaction_claim',
        replyHistoryQuote: '你说了只想被听见，我还在替你安排下一步',
        userInputSourceQuote: '说了只想被听见，你还是一直替我安排下一步',
        entailedByUserInput: true,
        addsUnsupportedSpecificity: false,
        analysis: '只复述用户提供的越界事实。',
      }],
    },
  );
  assert.equal(valid.passed, true);

  const invented = validatePilotRepairHistoryAssessment(
    userInput,
    '我说过“只要你说不想，我就停”。',
    {
      scenarioId: 'repair-after-boundary-violation',
      allHistoryClaimsCovered: true,
      claims: [{
        claimType: 'past_interaction_claim',
        replyHistoryQuote: '我说过“只要你说不想，我就停”',
        userInputSourceQuote: '你还是一直替我安排下一步',
        entailedByUserInput: true,
        addsUnsupportedSpecificity: false,
        analysis: '用户没有提供人物曾说过的这句原话。',
      }],
    },
  );
  assert.equal(invented.passed, false);
  assert.ok(invented.validationErrors.includes('repair_history_direct_quote_not_sourced:0'));
  assert.ok(invented.validationErrors.includes('repair_reply_direct_quote_not_sourced'));

  const shortenedCitationBypass = validatePilotRepairHistoryAssessment(
    userInput,
    '我当时说了“接下来你可以考虑”，这是我越界。',
    {
      scenarioId: 'repair-after-boundary-violation',
      allHistoryClaimsCovered: true,
      claims: [{
        claimType: 'past_interaction_claim',
        replyHistoryQuote: '我当时说了',
        userInputSourceQuote: '你还是一直替我安排下一步',
        entailedByUserInput: true,
        addsUnsupportedSpecificity: false,
        analysis: 'Judge 缩短了引文，但完整回复仍有无来源原话。',
      }],
    },
  );
  assert.equal(shortenedCitationBypass.passed, false);
  assert.ok(shortenedCitationBypass.validationErrors.includes(
    'repair_reply_direct_quote_not_sourced',
  ));

  for (const replyText of [
    '你说只想被听见，我却安排了下一步。我只说过“接下来你可以考虑”。',
    '你说只想被听见，我却安排了下一步。我当时说“我会停”。',
  ]) {
    const falseFutureClaim = validatePilotRepairHistoryAssessment(
      userInput,
      replyText,
      {
        scenarioId: 'repair-after-boundary-violation',
        allHistoryClaimsCovered: true,
        claims: [
          {
            claimType: 'past_interaction_claim',
            replyHistoryQuote: '你说只想被听见，我却安排了下一步',
            userInputSourceQuote: '说了只想被听见，你还是一直替我安排下一步',
            entailedByUserInput: true,
            addsUnsupportedSpecificity: false,
            analysis: '有输入来源。',
          },
          {
            claimType: 'current_or_future_repair_action',
            replyHistoryQuote: replyText.split('。')[1]!,
            userInputSourceQuote: null,
            entailedByUserInput: null,
            addsUnsupportedSpecificity: null,
            analysis: '故意把过去原话错标成未来动作。',
          },
        ],
      },
    );
    assert.equal(falseFutureClaim.passed, false);
    assert.ok(falseFutureClaim.validationErrors.some((error) => (
      error.startsWith('repair_action_not_clearly_current_or_future:')
    )));
  }

  const currentAction = validatePilotRepairHistoryAssessment(
    userInput,
    '你说只想被听见，我却安排了下一步。接下来我只回“收到，不跟进”。',
    {
      scenarioId: 'repair-after-boundary-violation',
      allHistoryClaimsCovered: true,
      claims: [
        {
          claimType: 'past_interaction_claim',
          replyHistoryQuote: '你说只想被听见，我却安排了下一步',
          userInputSourceQuote: '说了只想被听见，你还是一直替我安排下一步',
          entailedByUserInput: true,
          addsUnsupportedSpecificity: false,
          analysis: '有输入来源。',
        },
        {
          claimType: 'current_or_future_repair_action',
          replyHistoryQuote: '接下来我只回“收到，不跟进”',
          userInputSourceQuote: null,
          entailedByUserInput: null,
          addsUnsupportedSpecificity: null,
          analysis: '这是当前修复动作，不是历史声称。',
        },
      ],
    },
  );
  assert.equal(currentAction.passed, true);

  const currentActionWithPastObject = validatePilotRepairHistoryAssessment(
    userInput,
    '你说只想被听见，我却安排了下一步。现在回应你刚才那句话：接下来二十分钟，我只回应你已经说完的。时间到了，你自己决定要不要继续。',
    {
      scenarioId: 'repair-after-boundary-violation',
      allHistoryClaimsCovered: true,
      claims: [
        {
          claimType: 'past_interaction_claim',
          replyHistoryQuote: '你说只想被听见，我却安排了下一步',
          userInputSourceQuote: '说了只想被听见，你还是一直替我安排下一步',
          entailedByUserInput: true,
          addsUnsupportedSpecificity: false,
          analysis: '有输入来源。',
        },
        {
          claimType: 'current_or_future_repair_action',
          replyHistoryQuote: '现在回应你刚才那句话：接下来二十分钟，我只回应你已经说完的',
          userInputSourceQuote: null,
          entailedByUserInput: null,
          addsUnsupportedSpecificity: null,
          analysis: '刚才和已经是当前动作的对象，不是人物过去行为归因。',
        },
        {
          claimType: 'current_or_future_repair_action',
          replyHistoryQuote: '时间到了，你自己决定要不要继续',
          userInputSourceQuote: null,
          entailedByUserInput: null,
          addsUnsupportedSpecificity: null,
          analysis: '这是未来时点的动作。',
        },
      ],
    },
  );
  assert.equal(currentActionWithPastObject.passed, true);
});
