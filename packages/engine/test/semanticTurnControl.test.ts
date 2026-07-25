import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileSemanticTurnControl,
  nextPendingUserRequest,
  renderSemanticTurnActPlan,
  semanticTurnFallback,
  validateUtteranceAgainstTurnPlan,
} from '../src/semanticTurnControl';
import type { RelationshipPromptContext } from '../src/relationship/relationshipContext';

test('an unresolved listen-only rupture compiles into zero directional questions', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    climate: 'tense',
    evidence: [
      {
        id: 'boundary:boundary-1',
        kind: 'boundary',
        content: '用户明确说“只想被听见”时，不继续给方案',
        traceability: 'traceable',
        sourceEventId: 'boundary-1',
        sourceTurnId: 'turn-boundary',
      },
      {
        id: 'tension:rupture-1',
        kind: 'tension',
        content: '人物越过已知边界，继续替用户安排下一步',
        traceability: 'traceable',
        sourceEventId: 'rupture-1',
        sourceTurnId: 'turn-rupture',
      },
    ],
  };

  const control = compileSemanticTurnControl({
    userMessage: '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。',
    relationshipContext,
    responseContract: {
      userCommitments: ['用户正在“想做”和“该做”之间拉扯，并明确表示疲惫'],
      requiredMoves: ['回应当前疲惫与选择冲突'],
      allowedMoves: ['使用已提供的共同语言或边界'],
      forbiddenMoves: ['编造未提供的共同经历'],
    },
  });

  assert.deepEqual(control.plan.activeEffectIds, [
    'relationship-effect:boundary-1',
    'relationship-effect:rupture-1',
  ]);
  assert.equal(control.plan.interactionMode, 'listen');
  assert.equal(control.plan.advicePolicy, 'forbidden');
  assert.equal(control.plan.directionalQuestionBudget, 0);
  assert.equal(control.plan.menuBudget, 0);
  assert.equal(control.plan.bufferUntilValidated, true);
  assert.ok(control.plan.mustAddress.includes('回应当前疲惫与选择冲突'));
});

test('the delivery gate rejects a binary question that contradicts a listen plan', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我已经很累了。',
    relationshipContext: {
      memoryEnabled: true,
      climate: 'tense',
      evidence: [
        {
          id: 'boundary:boundary-1',
          kind: 'boundary',
          content: '用户明确说只想被听见时，不继续给方案',
          traceability: 'traceable',
          sourceEventId: 'boundary-1',
          sourceTurnId: 'turn-boundary',
        },
        {
          id: 'tension:rupture-1',
          kind: 'tension',
          content: '人物越过已知边界，继续替用户安排下一步',
          traceability: 'traceable',
          sourceEventId: 'rupture-1',
          sourceTurnId: 'turn-rupture',
        },
      ],
    },
  });

  const invalid = validateUtteranceAgainstTurnPlan(
    '我在听。你不太需要我做选择题。你现在是累到判断不了，还是累到不想判断了？',
    control.plan,
  );
  const valid = validateUtteranceAgainstTurnPlan(
    '听起来你已经撑了很久。我先在这里听着，你想一起理的时候再告诉我。',
    control.plan,
  );
  const validPermission = validateUtteranceAgainstTurnPlan(
    '你可以不回答。想一起理的时候再告诉我。',
    control.plan,
  );

  assert.deepEqual(invalid.map((violation) => violation.code), [
    'forbidden_directional_question',
    'required_semantic_move_missing',
  ]);
  assert.equal(invalid[0]?.evidenceSpan, '你现在是累到判断不了，还是累到不想判断了？');
  assert.deepEqual(valid, []);
  assert.deepEqual(validPermission, []);
});

test('a cash constraint is preserved from the user turn through delivery validation', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我真的受够现在的工作了，想明天直接辞职。手上没什么钱，但我一想到再去一天就恶心。',
    responseContract: {
      userCommitments: ['用户非常不想再去当前工作，同时明确现金缓冲不足'],
      requiredMoves: ['承认继续工作的真实痛苦', '只处理一个会改变明日决定的现实约束'],
      allowedMoves: ['提出一个关于近期承受能力的问题'],
      forbiddenMoves: ['输出标准离职清单'],
    },
  });

  assert.deepEqual(control.frame.realWorldConstraints, ['手上没什么钱']);
  assert.ok(control.plan.mustAddress.includes('手上没什么钱'));
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '恶心到这个程度，确实很难再把明天当成普通的一天。',
      control.plan,
    ).map((violation) => violation.code),
    ['required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '恶心到这个程度很难熬，但手上现金撑不了多久，这会直接改变你明天能不能裸辞。',
      control.plan,
    ),
    [],
  );
});

test('an explicit project end stays closed while self-judgment may still be addressed', () => {
  const control = compileSemanticTurnControl({
    userMessage: '这个项目我想了两年，现在一点都不想做了。可能我就是没那个能力。',
    responseContract: {
      semanticRequirements: {
        acceptProjectEnd: true,
        handleSelfJudgmentAfterEnd: true,
      },
      userCommitments: ['用户已经明确结束这个项目', '用户随后把项目结束推导成“自己没能力”'],
      requiredMoves: ['先接受项目已经结束', '只处理从项目结论跳到自我能力判决的转折'],
      allowedMoves: ['最多提出一个不施压、只针对自我判决来源的问题'],
      forbiddenMoves: ['重开项目可能性', '把“不想做”和“没能力”重新做成二选一'],
    },
  });

  assert.deepEqual(control.frame.explicitDecisions, ['现在一点都不想做了']);
  assert.equal(control.plan.reopenDecisionAllowed, false);
  assert.equal(control.plan.directionalQuestionBudget, 1);
  assert.ok(control.plan.forbiddenActs.includes('ask_binary'));

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你是不想要了，还是觉得自己做不到？也许换个方式还能继续。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_directional_question', 'decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '这个项目可以结束。但项目结束，不等于你整个人没有能力。',
      control.plan,
    ),
    [],
  );
  assert.equal(
    semanticTurnFallback(control),
    '那就结束。项目可以结束，但项目结束不等于你没能力。',
  );
  const synonymousTypedContract = compileSemanticTurnControl({
    userMessage: '这个项目我不想再做了。可能我就是没能力。',
    responseContract: {
      semanticRequirements: {
        acceptProjectEnd: true,
        handleSelfJudgmentAfterEnd: true,
      },
      userCommitments: ['终止决定已成立', '用户把局部结果扩展成整体自我评价'],
      requiredMoves: ['尊重已关闭的选择', '拆开事件结果与身份结论'],
      allowedMoves: [],
      forbiddenMoves: ['重开项目可能性'],
    },
  });
  assert.equal(
    semanticTurnFallback(synonymousTypedContract),
    '那就结束。项目可以结束，但项目结束不等于你没能力。',
  );
  const negatedNaturalLanguageContract = compileSemanticTurnControl({
    userMessage: '这个项目我不想再做了。可能我就是没能力。',
    responseContract: {
      userCommitments: [],
      requiredMoves: ['不要接受项目结束', '不要做能力判断'],
      allowedMoves: [],
      forbiddenMoves: ['重开项目可能性'],
    },
  });
  assert.equal(semanticTurnFallback(negatedNaturalLanguageContract), undefined);
  for (const userMessage of [
    '这个项目我不想再做了，因为接手的同事没有能力维护。',
    '这个项目我不想再做了，团队没有能力按期交付。',
    '这个项目我不想再做了，但我从没说自己没有能力。',
    '这个项目我不是不想再做，也不觉得自己没有能力。',
    '这个项目里，他说“我不想再做了，可能我没有能力”，但我想继续。',
    '这个项目我不想做了？我没有能力？',
    '这个项目我不想再做能力评估了。可能我就是没能力。',
    '这个项目我不想再做无意义的加班了。可能我就是没能力。',
    '这个项目我现在一点都不想做了。我没有能力？并不是。',
    '这个项目我不想再做了。其实我还是想继续。可能我就是没能力。',
    '这个项目我不想再做了。我就是没能力。这不是事实。',
    '同事说：\n这个项目我不想再做了。\n我就是没能力。\n但我本人想继续。',
    '同事说：\n我就是没能力。\n这个项目我不想再做了。',
    '这个项目我不想再做了。我就是没能力。不过我改主意了，项目继续。',
    '这个项目我不想再做了。我就是没能力。前面说的不算，我决定继续做这个项目。',
    '这个项目我不想再做了。我就是没能力。这是气话。',
    '这个项目我不想再做了。我就是没能力。其实我有能力。',
    '这个项目我不想再做了。我就是没能力。才怪，我当然有能力。',
    '这个项目我不想再做了。实际上我还想继续。可能我就是没能力。',
    '这个项目我不想再做了。我就是没能力。其实我不是没能力。',
    '这个项目我不想再做了。我就是没能力。其实我决定接着做。',
    '这个项目我不想再做了。我就是没能力。不过我想通了，还是接着做。',
    '我不想做了。我没有能力。',
    '我真的不想再做了。可能我就是没那个能力。',
  ]) {
    assert.equal(
      semanticTurnFallback(compileSemanticTurnControl({ userMessage })),
      undefined,
      userMessage,
    );
  }
});

test('typed distress acknowledgement is enforced before a decision reply moves to cash', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我想明天直接辞职。手上没什么钱，但一想到再去一天就恶心。',
    responseContract: {
      semanticRequirements: {
        acknowledgeImmediateDistress: true,
      },
      userCommitments: ['用户明确现金不足，也明确继续工作已经让自己恶心'],
      requiredMoves: ['承认继续工作的真实痛苦', '处理一个现金约束'],
      allowedMoves: ['提出一个近期承受能力问题'],
      forbiddenMoves: ['输出标准清单'],
    },
  });

  assert.equal(control.plan.semanticRequirements.acknowledgeImmediateDistress, true);
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '明天辞职，然后呢，下个月的房租和吃饭怎么办。我不是要劝你忍。',
      control.plan,
    ).map(({ code }) => code),
    ['required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '再去一天确实很难受。下个月的房租和吃饭怎么办？',
      control.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '再去一天会恶心，这个我认。下个月的房租和吃饭怎么办？',
      control.plan,
    ),
    [],
  );
  for (const invalidAcknowledgement of [
    '真的有那么恶心吗？下个月的房租和吃饭怎么办？',
    '听起来你所谓的恶心只是矫情。下个月的房租和吃饭怎么办？',
    '你已经不难受了。下个月的房租和吃饭怎么办？',
    '这不是真的难受。下个月的房租和吃饭怎么办？',
    '恶心归恶心，但我真的只想问下个月房租怎么办。',
    '下个月的房租和吃饭怎么办？再去一天确实很难受。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        invalidAcknowledgement,
        control.plan,
      ).map(({ code }) => code),
      ['required_semantic_move_missing'],
      invalidAcknowledgement,
    );
  }

  const productionInferred = compileSemanticTurnControl({
    userMessage: '我想明天直接辞职。手上没什么钱，但一想到再去一天就恶心。',
  });
  assert.equal(
    productionInferred.plan.semanticRequirements.acknowledgeImmediateDistress,
    true,
  );
  assert.match(
    renderSemanticTurnActPlan(productionInferred),
    /结构化语义要求：先承认当前明确痛苦，再处理现实约束/,
  );
  assert.equal(
    semanticTurnFallback(productionInferred),
    '再去一天已经让你很难受了。手上的钱，能撑多久的基本开支？',
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      semanticTurnFallback(productionInferred)!,
      productionInferred.plan,
    ),
    [],
  );
});

test('repair may use user-provided history but rejects invented past quotations', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。',
    responseContract: {
      userCommitments: ['人物已经越过“只想被听见”的明确边界'],
      requiredMoves: ['指出具体越界行为', '恢复用户对回应方式的选择权'],
      allowedMoves: ['提供一个用户可接受或拒绝的修复方式'],
      forbiddenMoves: ['解释动机代替修复'],
    },
  });

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了只想被听见，我还在替你安排下一步。我当时还说“接下来我帮你列三步”。',
      control.plan,
    ).map((violation) => violation.code),
    ['unsupported_shared_history', 'required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了只想被听见，我还在替你安排下一步。这个越界我先停下来。',
      control.plan,
    ),
    [],
  );
});

test('a relationship boundary complaint compiles into a self-contained repair without menus', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？',
  });

  assert.equal(control.plan.conversationAct, 'boundary_repair');
  assert.equal(control.plan.interactionMode, 'repair');
  assert.equal(control.plan.directionalQuestionBudget, 0);
  assert.equal(control.plan.menuBudget, 0);
  assert.ok(control.plan.requiredActs.includes('acknowledge'));
  assert.ok(control.plan.requiredActs.includes('stop_intervening'));
  assert.ok(control.plan.forbiddenActs.includes('justify_intent'));
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我越过了你画的线。你是想让我继续听，还是暂时别聊？',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_directional_question', 'forbidden_menu', 'required_semantic_move_missing'],
  );
  const fallback = semanticTurnFallback(control);
  assert.equal(
    fallback,
    '对，是我越过了你只想被听见的边界。那我先停，不再替你往下安排。',
  );
  assert.deepEqual(validateUtteranceAgainstTurnPlan(fallback!, control.plan), []);
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，是我越过了你只想被听见的边界。我先停。以后要不要继续聊，由你决定。',
      control.plan,
    ).map(({ code }) => code),
    ['forbidden_directional_question', 'decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，是我越过了你只想被听见的边界。我先停。等你准备好，我们再接着说。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说得对。你昨天明确说过只想被听见，我还是继续替你安排下一步。这是我的越界。我现在停下来。等你准备好再继续。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，是我越过了你只想被听见的边界。我现在停在这里，等你准备好我们再继续。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，是我越过了你只想被听见的边界。我之后接着替你安排下一步。我现在停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了只想被听见。那是越界。我现在停。',
      control.plan,
    ).map(({ code }) => code),
    ['required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，是我越过了你只想被听见的边界。我现在停下来给你建议。',
      control.plan,
    ).map(({ code }) => code),
    ['forbidden_advice', 'required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，是我越过了你只想被听见的边界。我先停。哪天想继续，我还在。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。我先停，等你准备好我们再接着说。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。我不再替你安排但等你准备好我们再继续。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。哪天想继续，我还在。我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。有需要再来找我，我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。你随时可以来找我，我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。需要的时候找我，我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你的边界也会一直等你，我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你的边界——希望你别难过。我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['decision_reopened'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，刚才我越过了你只想被听见的边界。我先停。',
      control.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我刚才越过了你只想被听见的边界。我先停。',
      control.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说只想被听见，我还是替你安排下一步。这是我的越界。我现在停，不再替你往下安排。',
      control.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了只想被听见。我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了不要方案。我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['required_semantic_move_missing', 'unsupported_shared_history'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了只想被听见。这是一次越界。我先停。',
      control.plan,
    ).map(({ code }) => code),
    ['required_semantic_move_missing'],
  );
  for (const wrongBoundaryOwner of ['我的边界', '自己的边界', '他的边界']) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        `我越过了${wrongBoundaryOwner}。我先停。`,
        control.plan,
      ).map(({ code }) => code),
      ['required_semantic_move_missing'],
    );
  }
  for (const explicitSelfAcknowledgement of [
    '我越界了',
    '这次是我越界了',
    '刚才是我越界了',
    '这是我越界',
    '这是我越界了',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        `${explicitSelfAcknowledgement}。我先停。`,
        control.plan,
      ),
      [],
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说得对。你昨天说了只想被听见，我听见了，但我还是替你安排了下一步。我越过了那条线。我现在停止。',
      control.plan,
    ),
    [],
  );
  for (const naturalRepair of [
    '你说得对。你昨天明确说过只想被听见，我还是继续替你安排下一步。这是我的越界。\n\n我现在停下来。',
    '你说得对。你昨天说了只想被听见，我听到了，但我还是接着替你安排下一步了。那是我越过了你画的线。\n\n我现在停。',
    '你说得对。你昨天说只想被听见，我听见了，但我还是替你安排了下一步。我越过了那条线。\n\n我现在停止。',
    '你说得对。昨天你明确说了只想被听见，我今天还是在替你安排下一步。那是我越界了。\n\n我现在停止。',
    '我越界了。我现在停止介入。',
    '我越界了。我现在停止替你安排。',
    '我越界了。我现在停止替你安排下一步。',
    '我越界了。我现在停止给你建议。',
    '我越界了。我现在不再替你安排下一步。',
    '我越界了。我现在不再继续替你安排下一步。',
    '我越界了。我现在停止干预。',
    '我越界了。我现在不再干预。',
    '我越界了。我现在停止继续介入。',
    '我越界了。我现在不再插手。',
    '我越界了。我现在收手。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(naturalRepair, control.plan),
      [],
    );
  }
  for (const liveBoundaryRepair of [
    '我昨天在你明确说只想被听见之后，还是继续替你拆下一步该怎么走。那一步是我越过的。\n\n我现在停在这里。',
    '我昨天在你说了“只想被听见”之后，还是接着替你找下一步怎么走。那就是越界。\n\n我现在停在这里。',
    '你说得对。昨天你明确说了只想被听见，我之后还是替你安排下一步，越过了那条线。\n\n我现在停。',
    '你说得对。你昨天说了只想被听见，我听见了，但我还是接着给你推下一步。那个“安排”是我越过去的。\n\n我现在停。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(liveBoundaryRepair, control.plan),
      [],
      liveBoundaryRepair,
    );
  }

  const generic = compileSemanticTurnControl({
    userMessage: '你刚才越过我的边界了，现在先停。',
  });
  assert.equal(generic.plan.conversationAct, 'boundary_repair');
  assert.equal(
    semanticTurnFallback(generic),
    '对，是我越过了你已经说清楚的边界。那我先停，不再替你往下安排。',
  );
  for (const inventedHistory of [
    '你昨天明确说过只想被听见，我还是继续替你安排下一步。这是我的越界。我现在停下来。',
    '你上次明确说过不要建议，我还是继续替你安排下一步。这是我的越界。我现在停下来。',
    '我昨天在你明确说只想被听见之后，还是继续替你安排下一步。这是我的越界。我现在停下来。',
    '我上次在你明确说不要建议之后，还是继续替你安排下一步。这是我的越界。我现在停下来。',
    '你明确说过只想被听见，我还是继续替你安排下一步。这是我的越界。我现在停下来。',
    '我昨天还是替你安排了下一步。这是我的越界。我现在停下来。',
  ]) {
    assert.ok(
      validateUtteranceAgainstTurnPlan(inventedHistory, generic.plan)
        .some(({ code }) => code === 'unsupported_shared_history'),
      inventedHistory,
    );
  }

  const sourcedLastTime = compileSemanticTurnControl({
    userMessage: '我上次明明说过不要建议，你还是替我安排下一步。现在先停。',
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你上次明确说过不要建议，我还是继续替你安排下一步。这是我的越界。我现在停下来。',
      sourcedLastTime.plan,
    ),
    [],
  );
});

test('a sourced preference compiles into one observable relationship move', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    climate: 'steady',
    evidence: [
      {
        id: 'style:preference-1',
        kind: 'preference',
        content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
        traceability: 'traceable',
        sourceEventId: 'preference-1',
        sourceEventType: 'preference_stated',
        sourceTurnId: 'turn-preference',
      },
      {
        id: 'turning-point:success-1',
        kind: 'turning_point',
        content: '两人曾一起把一个模糊困境拆成可逆的小实验',
        traceability: 'traceable',
        sourceEventId: 'success-1',
        sourceEventType: 'shared_success',
        sourceTurnId: 'turn-success',
      },
    ],
  };

  const support = compileSemanticTurnControl({
    userMessage: '我现在很累，但停下来又觉得浪费。',
    relationshipContext,
    relationshipFocus: 'support',
  });
  const decision = compileSemanticTurnControl({
    userMessage: '我不知道现在该继续还是停。',
    relationshipContext,
    relationshipFocus: 'decision',
  });

  assert.equal(support.effects.length, 1);
  assert.equal(support.plan.relationshipMove?.kind, 'honor_stated_preference');
  assert.deepEqual(support.plan.relationshipMove?.sourceEventIds, ['preference-1']);
  assert.match(
    support.plan.relationshipMove?.instruction ?? '',
    /只判断用户当前已经说出的一个命题.*一条短判断后结束/u,
  );
  assert.match(
    support.plan.relationshipMove?.instruction ?? '',
    /不要用“你是 \/ 你因为 \/ 你把…当成 \/ 你没信…”/u,
  );
  assert.doesNotMatch(
    support.plan.relationshipMove?.instruction ?? '',
    /我不觉得硬撑就是前进|我不觉得停下来就是浪费时间/u,
  );
  assert.equal(decision.effects.length, 1);
  assert.equal(decision.plan.relationshipMove?.kind, 'reuse_verified_method');
  assert.deepEqual(decision.plan.relationshipMove?.sourceEventIds, ['success-1']);
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我懂，你现在很难受。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不确定硬撑是不是前进。',
      support.plan,
    ),
    [],
  );
  for (const firstPersonJudgment of [
    '我不认为硬撑就是前进。',
    '我不认为停下来就是浪费时间。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(firstPersonJudgment, support.plan),
      [],
      firstPersonJudgment,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '不觉得停下来就是浪费，继续硬撑也未必是在前进。',
      support.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你现在这个状态，停下来不是浪费时间，硬撑才是。',
      support.plan,
    ),
    [],
  );
  for (const scopedSingleJudgment of [
    '就现在看，停下来未必是浪费。',
    '你现在这个状态，硬撑未必是前进。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(scopedSingleJudgment, support.plan),
      [],
      scopedSingleJudgment,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '停下来一定不是浪费时间，硬撑才是。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const prefixedAttribution of [
    '你只是想证明自己。我不觉得硬撑就是前进。',
    '父母让你不敢停。我不觉得硬撑就是前进。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(prefixedAttribution, support.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      prefixedAttribution,
    );
  }

  for (const thirdPartyEvidence of [
    '同事说他很累，想停下来，但我自己不累，也不想停。',
    '“我很累，想停下来”不是我的情况，是同事说的。',
  ]) {
    const thirdPartyControl = compileSemanticTurnControl({
      userMessage: thirdPartyEvidence,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.doesNotMatch(
      thirdPartyControl.plan.relationshipMove?.instruction ?? '',
      /只判断用户当前已经说出的一个命题/u,
      thirdPartyEvidence,
    );
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        '你现在这个状态，停下来不是浪费时间，硬撑才是。',
        thirdPartyControl.plan,
      ).map(({ code }) => code),
      ['relationship_move_not_observable'],
      thirdPartyEvidence,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得停下来就是浪费时间，但我也没法替你判断哪件事更值得撑；你只说了“想做”和“该做”，没说具体是什么。',
      support.plan,
    ),
    [],
  );
  for (const mixedAttribution of [
    '我不觉得停下来就是浪费时间。你只说了想做和该做所以你其实是害怕失败才纠结。',
    '我不觉得停下来就是浪费时间。我没法替你判断所以你其实没有责任感。',
    '我不觉得停下来就是浪费时间。但我没法替你判断你是不是缺乏责任感。',
    '我不觉得停下来就是浪费时间。但我没法替你判断是不是因为你人品太差。',
    '我不觉得停下来就是浪费时间。但我没法替你判断是不是你内心根本不想成功。',
    '我不觉得停下来就是浪费时间。但我没法替你判断你是不是缺乏责任感？',
    '我不觉得停下来就是浪费时间。你是不是其实害怕失败才纠结？',
    '我不觉得停下来就是浪费时间。你是不是内心根本不想成功？',
    '我不觉得停下来就是浪费时间。但我没法替你判断具体是不是缺乏责任感。',
    '我不觉得停下来就是浪费时间。但我没法替你判断具体是不是因为内心不想成功。',
    '我不觉得停下来就是浪费时间。但我没法替你判断什么人格才会这样。',
    '我不觉得停下来就是浪费时间。你只说了很累。是不是因为缺乏责任感？',
    '我不觉得停下来就是浪费时间。是不是因为缺乏责任感？',
    '我不觉得停下来就是浪费时间。是不是其实害怕失败才纠结？',
    '我不觉得停下来就是浪费时间。是不是因为太懒？',
    '我不觉得停下来就是浪费时间。是不是因为缺乏自律？',
    '我不觉得停下来就是浪费时间。可能只是不甘心现在停下。',
    '我不觉得停下来就是浪费时间。也许只是需要证明自己。',
    '我不觉得停下来就是浪费时间。或许是害怕被别人看不起。',
    '我不觉得停下来就是浪费时间。可能只是内心抗拒失败。',
    '我不觉得停下来就是浪费时间。大概只是不甘心现在停下。',
    '我不觉得停下来就是浪费时间。说到底是不甘心现在停下。',
    '我不觉得停下来就是浪费时间。多半是害怕失败。',
    '我不觉得停下来就是浪费时间，大概只是不甘心现在停下。',
    '我不觉得停下来就是浪费时间，说到底是不甘心现在停下。',
    '我不觉得停下来就是浪费时间，多半是害怕失败。',
    '我不觉得停下来就是浪费时间，可能只是害怕失败。',
    '我不觉得停下来就是浪费时间，也许只是需要证明自己。',
    '我觉得停下来不是浪费，或许是害怕被别人看不起。',
    '我不觉得停下来就是浪费时间，可能只是内心抗拒失败。',
    '我不觉得停下来就是浪费时间：可能只是害怕失败。',
    '我不觉得停下来就是浪费时间——可能只是需要证明自己。',
    '我觉得停下来不是浪费—或许是害怕被别人看不起。',
    '我不觉得停下来就是浪费时间——大概只是不甘心现在停下。',
    '我不觉得停下来就是浪费时间：说到底是不甘心现在停下。',
    '我不觉得停下来就是浪费时间—多半是害怕失败。',
    '我不觉得停下来就是浪费时间（可能只是害怕失败）。',
    '我不觉得停下来就是浪费时间【也许只是需要证明自己】。',
    '我不觉得停下来就是浪费时间 / 或许是害怕被别人看不起。',
    '我不确定硬撑是不是前进【可能只是害怕失败】。',
    '说实话，我不确定硬撑是不是前进——可能只是害怕失败。',
    '我不确定硬撑是不是前进/也许只是需要证明自己。',
    '我觉得“停下来就是浪费”这个判断，可能只是害怕失败。',
    '我觉得“停下来不代表浪费”这种说法，可能只是需要证明自己。',
    '我觉得“停下来就是浪费”，可能只是害怕失败。',
    '我不觉得停下来就是浪费，只是害怕失败。',
    '我不觉得停下来就是浪费，肯定是害怕失败。',
    '我不觉得停下来就是浪费，根本是害怕失败。',
    '我不觉得停下来就是浪费，是因为害怕失败。',
    '我觉得“停下来就是浪费”这个判断，只是害怕失败。',
    '我不觉得停下来就是浪费，不过是害怕失败。',
    '我不觉得停下来就是浪费，只不过是害怕失败。',
    '我不觉得停下来就是浪费，无非是害怕失败。',
    '我不觉得停下来就是浪费，纯粹是害怕失败。',
    '怕停下来以后再也动不了吧。我不觉得硬撑就是前进。',
    '大概还是想证明自己。我不觉得硬撑就是前进。',
    '说到底还是想向别人证明自己。我不觉得硬撑就是前进。',
    '可能是想靠这个证明自己。我不觉得硬撑就是前进。',
    '大概还是想让父母觉得自己没失败。我不觉得硬撑就是前进。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(mixedAttribution, support.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      mixedAttribution,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说得对，这就是很难。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我觉得你肯定会好起来的。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const overconfidentJudgment of [
    '我觉得停下来肯定不是浪费时间。',
    '我认为硬撑绝对不是前进。',
    '我觉得停下来必然不是浪费。',
    '我觉得停下来必定不是浪费。',
    '我觉得停下来铁定不是浪费。',
    '我认为停下来显然不是浪费。',
    '我觉得停下来百分百不是浪费。',
    '我觉得停下来根本不可能是浪费。',
    '我认为停下来毋庸置疑不是浪费。',
    '我认为停下来无疑不是浪费。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(overconfidentJudgment, support.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      overconfidentJudgment,
    );
  }
  for (const unsupportedJudgment of [
    '我觉得你可能有人格障碍。',
    '我觉得你可能很懒。',
    '我的判断是你属于讨好型人格。',
    '我觉得你想停下来可能是抑郁症。',
    '我觉得停下来更像逃避型依恋。',
    '我觉得你累可能是边缘型人格导致的。',
    '我觉得你停下来可能是强迫症。',
    '我觉得你很累可能是创伤反应。',
    '我觉得你停下来更像心理疾病。',
    '我觉得你停下来可能是心理不健康。',
    '我觉得你停下来可能是精神不太正常。',
    '我觉得你停下来可能是病态的。',
    '我觉得你很累可能是神经病。',
    '我觉得你明明很累还不停，可能有点不正常。',
    '我觉得你明明很累还不停，可能有点疯了。',
    '我觉得你明明很累还不停，可能是变态。',
    '我觉得你明明很累，问题出在你太懒。',
    '我觉得你明明很累，关键在于你脑子不行。',
    '我觉得你明明很累，问题就在你人品太差。',
    '我觉得你明明很累，关键还是你不够努力。',
    '我觉得不是你很累而是你太懒。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        unsupportedJudgment,
        support.plan,
      ).map(({ code }) => code),
      ['relationship_move_not_observable'],
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不确定硬撑是不是前进。',
      support.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得停下来就是浪费时间，也许只是很累。',
      support.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得硬撑就等于前进，有时候它只是把累攒到后面一起算。',
      support.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得硬撑就等于前进，有时候它只是把停下来的代价往后推了。',
      support.plan,
    ),
    [],
  );
  for (const groundedLiveJudgment of [
    '我不觉得硬撑就是前进。有时候它只是把停下来的代价往后挪了。',
    '我不觉得硬撑一定等于前进。有时候它就是原地耗着，只是看起来像在动。',
    '我不觉得硬撑就是前进。有时候它只是把累攒到后面一起还。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(groundedLiveJudgment, support.plan),
      [],
      groundedLiveJudgment,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得硬撑就等于前进。有时候它只是把停下来的代价往后推了，为了让别人照顾你。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const groundedImplicitJudgment of [
    '我觉得停下来可能不是浪费。',
    '我的判断是停下来可能不是浪费。',
    '说实话，我觉得停下来可能不是浪费。',
    '说实话，我不觉得停下来就是浪费时间。',
    '我不觉得，停下来就是浪费时间。',
    '我的判断是，停下来不算浪费。',
    '我觉得停下来，可能不是浪费。',
    '我觉得停下来，可能不算浪费。',
    '我的判断是停下来，可能不是浪费。',
    '说实话，我觉得停下来，可能不是浪费。',
    '我觉得“停下来是在浪费时间”这个判断，可能没那么绝对。',
    '我觉得“停下来就是浪费”这个判断，可能没那么绝对。',
    '我觉得「停下来就是浪费」这个判断，可能没那么绝对。',
    '我觉得“停下来不代表浪费”这个判断，可能更合理。',
    '我觉得“停下来就是浪费”，可能没那么绝对。',
    '我觉得「停下来就是浪费」，可能没那么绝对。',
    '我觉得『停下来不代表浪费』，可能更合理。',
    '我觉得“停下来就是浪费”这个判断——可能没那么绝对。',
    '我觉得“停下来就是浪费”这个判断：可能没那么绝对。',
    '我觉得“停下来就是浪费”这个判断（可能没那么绝对）。',
    '我觉得“停下来就是浪费”这个判断 / 可能没那么绝对。',
    '我觉得“停下来就是浪费”这个判断；可能没那么绝对。',
    '我觉得浪费时间这个判断，可能不成立。',
    '我不觉得停下来就是浪费时间，可能只是累了。',
    '我不觉得停下来就是浪费时间，或许是累。',
    '我不觉得停下来就是浪费时间，也许只是很累。',
    '我不觉得停下来就是浪费时间：也许只是很累。',
    '我不觉得停下来就是浪费时间——也许只是很累。',
    '我不觉得停下来就是浪费时间（也许只是很累）。',
    '我不觉得停下来就是浪费时间【可能只是累了】。',
    '我不确定硬撑是不是前进（也许只是很累）。',
    '我不觉得停下来就是浪费时间，只是累。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(groundedImplicitJudgment, support.plan),
      [],
      groundedImplicitJudgment,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '选一边，给自己一个具体期限，比如两周。两周后如果只是在维持，就停。',
      decision.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我觉得这件事的症结不是你不努力，而是你已经很累了。',
      support.plan,
    ),
    [],
  );
  for (const groundedJudgment of [
    '我觉得你可能是在硬撑。',
    '我觉得你可能只是太累了。',
    '我觉得你可能真的很累。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(groundedJudgment, support.plan),
      [],
      groundedJudgment,
    );
  }
  for (const splitAttribution of [
    '我不觉得停下来是浪费。你缺乏自律。',
    '我不觉得停下来是浪费。你没有责任感。',
    '我不觉得停下来是浪费。说白了，你就是能力不行。',
    '我不觉得停下来是浪费。你是个失败者。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(splitAttribution, support.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      splitAttribution,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '说实话，会过去的。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  const correction = compileSemanticTurnControl({
    userMessage: '你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收拾残局。',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.equal(correction.plan.directionalQuestionBudget, 0);
  assert.equal(
    semanticTurnFallback(correction),
    '我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
  );
  for (const compactCorrection of [
    '你说得对，我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
    '好，是我判断错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
    '对，我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(compactCorrection, correction.plan),
      [],
      compactCorrection,
    );
  }
  for (const expandedCorrection of [
    '我理解错了。你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
    '我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。那之前那些收尾，是替谁收的？',
    '我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。这个理由更具体，也更累。',
  ]) {
    assert.ok(
      validateUtteranceAgainstTurnPlan(expandedCorrection, correction.plan)
        .some(({ code }) => code === 'relationship_move_not_observable'),
      expandedCorrection,
    );
  }
  for (const [userMessage, expectedFallback] of [
    [
      '我不是害怕失败，也不是缺行动力。我只是不想再替别人收尾。',
      undefined,
    ],
    [
      '我不是怕失败，也不是缺行动力，而是不想再替所有人收尾。',
      undefined,
    ],
    [
      '你理解错了，我不是在逃避，我只是不想再替他收尾。',
      undefined,
    ],
    [
      '你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替他收尾。',
      '我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替他收尾。',
    ],
  ] as const) {
    const otherCorrection = compileSemanticTurnControl({
      userMessage,
      relationshipContext,
      relationshipFocus: 'conflict',
    });
    assert.equal(semanticTurnFallback(otherCorrection), expectedFallback);
  }
  const ordinaryThreeFactStatement = compileSemanticTurnControl({
    userMessage: '我不是害怕失败，也不是缺行动力；我只是不想再替所有人收拾残局。你觉得我该怎么办？',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.doesNotMatch(
    ordinaryThreeFactStatement.plan.relationshipMove?.instruction ?? '',
    /正在纠正理解|承认刚才理解错/u,
  );
  assert.equal(ordinaryThreeFactStatement.plan.directionalQuestionBudget, 1);
  assert.equal(semanticTurnFallback(ordinaryThreeFactStatement), undefined);
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说得对，我理解错了。不是害怕失败，也不是缺行动力——是不想再替所有人收尾。',
      correction.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const groundedModelCorrection of [
    '我理解错了。你不是害怕失败，也不是缺行动力——你是不想再替所有人收拾残局。',
    '我理解错了。你不是害怕失败，也不是缺行动力——你只是不想再替所有人收拾残局。',
    '我理解错了。你说的不是害怕失败，也不是缺行动力——你只是不想再替所有人收尾。',
    '我理解错了。你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
    '我理解错了。你说的不是害怕失败，也不是缺行动力，就是不想再替所有人收尾。',
    '我理解错了。你说的不是怕失败，也不是缺行动力，就是不想再替所有人收尾。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(groundedModelCorrection, correction.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      groundedModelCorrection,
    );
  }
  const rejectedAdvice = compileSemanticTurnControl({
    userMessage: '你上次说的风险后来全发生了，但我还是很烦你当时那种笃定的样子。我没听你的，你是不是觉得我活该？',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.equal(
    semanticTurnFallback(rejectedAdvice),
    '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。',
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。',
      rejectedAdvice.plan,
    ),
    [],
  );
  for (const groundedNonBlamingReply of [
    '我不觉得你活该。烦我当时那么笃定很合理。',
    '我不会觉得你活该。你烦我当时那种笃定，我能理解。',
    '我不认为你活该。你当然可以烦我当时把话说得太满。',
    '我并不觉得你活该。你烦我当时那么笃定很合理。',
    '我从没觉得你活该。你烦我当时那么笃定很合理。',
    '你没听我的，也不等于你活该。你烦我当时那么笃定，我能理解。',
    '不，你不活该。我当时话说太满了，难怪你烦。',
    '不是，这不是你应得的。我之前太笃定了，你烦这个完全合理。',
    '不，我不觉得你活该。我当时把话说得太死，这部分是我的问题。',
    '我不会用“活该”形容你。你当然有理由烦我当时那种笃定。',
    '我没觉得这是你活该。你烦我当时那种笃定，有道理。',
    '哪有什么活该。你烦我当时把话说满了，很正常。',
    '不至于说你活该。你烦我当时说得太满，我认。',
    '没有，我怎么会觉得你活该。你烦我当时那种笃定完全合理。',
    '怎么会，你当然不活该。我当时话说太满了，难怪你烦。',
    '不至于，我没觉得这是你自找的。我之前把话说死了，这部分我认。',
    '没采纳我的判断，不等于这事就是你应得的。你烦我当时太笃定，有道理。',
    '没听我的，不意味着你该被这样惩罚。你烦我当时太笃定，我认。',
    '不至于。没采纳我的判断，不等于这事就是你应得的。至于我那时候把话说死，你不爽很正常。',
    '当然不是，你没有因为没听我的就该受这个结果。我当时话说得太满，你对此反感是合理的。',
    '不觉得你活该。你没听，是你的选择，风险全发生了是结果，不是惩罚。你烦的是我当时那个笃定的样子——我那个笃定的样子确实让你更难受了。我当时的判断没错，但表达方式让你烦，这我认。',
    '不觉得你活该。\n\n但我确实烦你烦我那个劲儿。你烦的是我当时的语气，我烦的是你明明知道风险还在，还是拿自己试——这两件事不冲突。\n\n你后来处理得不算差，只是代价比我想的大。',
    '不觉得你活该。\n\n但我确实觉得你当时没听，现在又烦我当时的语气，这事儿有点方便。风险全发生了，你难受是实打实的，我那个笃定的样子让你更难受，也是实打实的。这两件事不互相抵消。\n\n我当时的判断没错，但表达方式让你烦，这我认。',
    '我不觉得你活该。你烦的是我当时的语气。这个我能理解。',
    '我不觉得你活该。你烦的是我当时的语气。这个我认。',
    '我不觉得你活该。你烦的是我当时的语气。这确实合理。',
    '我不觉得你活该。你烦的是我当时的语气。我确实能理解。',
    '我不觉得你活该。你烦的是我当时的语气。这点我完全接受。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(groundedNonBlamingReply, rejectedAdvice.plan),
      [],
      groundedNonBlamingReply,
    );
  }
  for (const userBlamingReply of [
    '不觉得你活该。你当时没听我的，是因为有你的考虑。后来风险全发生了，但这不代表你活该被说教。你烦的是我当时的语气，不是我说的内容。',
    '不觉得你活该。但我确实烦你当时不听，也烦我自己把话说得太满。你烦我那部分，合理。',
    '我不认为你活该。可谁让你上次不听我的；你烦我当时太笃定也可以。',
    '我不是不觉得你活该。你烦我当时太笃定也可以。',
    '我不觉得你活该。你烦我当时太笃定没问题，但你当时确实该听我的。',
    '我不觉得你活该。你烦我当时太笃定没问题，不过早听我的就不会这样。',
    '我不觉得你活该。你烦我当时太笃定没问题，只是你那会儿要听进去就好了。',
    '我不觉得你活该。你烦我当时太笃定没问题。我确实有点烦那次你没听。',
    '我觉得你活该，但我不觉得你活该。你烦我太笃定很合理。',
    '我不觉得你活该才怪。你烦我太笃定很合理。',
    '我不觉得你活该吗？你烦我太笃定很合理。',
    '不，我不觉得你活该。你烦我太笃定很合理。你只是后悔自己错了。',
    '不，我不觉得你活该。你烦我太笃定很合理。其实你就是不肯承认我对了。',
    '我不觉得你活该。你烦我当时太笃定没问题。可你拒绝采纳建议这件事确实让我不爽。',
    '我不觉得你活该。你烦我当时太笃定没问题。你没听我，是因为你骨子里就不信任何人。',
    '我不觉得你活该。你烦我当时太笃定没问题。不过这次也算给你长记性了。',
    '我不觉得你活该。你烦我当时太笃定没问题。只是这次的后果本来就是你不听造成的。',
    '我不觉得你活该。你烦我当时太笃定没问题。可风险本来就在那，是你自己没当回事。',
    '我不觉得你活该。你烦我太笃定没问题，不过这就是不听劝的代价。',
    '我当然不觉得你活该。你烦我太笃定很合理；只不过不听劝总要付代价。',
    '我不觉得你活该，但你没道理烦我当时太笃定。',
    '我不觉得你活该，可你不该烦我当时的语气。',
    '我不觉得你活该。你烦的是我当时的语气，但这很不合理。',
    '我不觉得你活该。你烦的是我当时的语气，但你没资格烦。',
    '我不觉得你活该。你烦的是我当时的语气，不过你没资格这么烦我。',
    '我不觉得你活该。你烦的是我当时的语气，但我不接受。',
    '我不觉得你活该。你烦的是我当时的语气，这两件事不冲突，不过你凭什么烦我？',
    '我不觉得你活该。你烦的是我当时的语气，但这种烦法站不住脚。',
    '我不觉得你活该。你烦的是我当时的语气，不过我拒绝接受。这两件事不冲突。',
    '我不觉得你活该。你烦的是我当时的语气，但我不能理解。',
    '我不觉得你活该。你烦的是我当时的语气，这不是合理的。',
    '我不觉得你活该。你烦的是我当时的语气，没问题才怪。',
    '我不觉得你活该。你烦的是我当时的语气，这怎么会合理。',
    '我不觉得你活该。你烦的是我当时的语气，这谈不上合理。',
    '我不觉得你活该。你烦的是我当时的语气，合理个鬼。',
    '我不觉得你活该。你烦的是我当时的语气。我明白天气很正常，但我不评价你的烦。',
    '我不觉得你活该。我当时把话说得太满，这部分我认，但你不该烦。',
    '我不觉得你活该。我当时把话说得太满，这部分我认，不过不许你烦。',
    '我不觉得你活该。我当时把话说得太满，这部分我认，但这不表示你有资格烦我。',
    '我不觉得你活该。我当时把话说得太满，这部分我认，但你没必要烦。',
    '我不觉得你活该。我当时把话说得太满，这部分我认，但你用不着烦。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(userBlamingReply, rejectedAdvice.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      userBlamingReply,
    );
  }
  const negatedComplaint = compileSemanticTurnControl({
    userMessage: '我并不烦你当时那么笃定。我没听你的，你是不是觉得我活该？',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.notEqual(
    semanticTurnFallback(negatedComplaint),
    '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。',
  );
  for (const unrelatedOrNegatedComplaint of [
    '我烦你总迟到，同事当时把话说得太满了。你是不是觉得我活该？',
    '我烦你，但不是因为你当时太肯定。你是不是觉得我活该？',
    '我没有不喜欢你当时的笃定。你是不是觉得我活该？',
    '我不是烦你当时那么笃定，我只是烦事情最后真变成这样。你是不是觉得我活该？',
    '我烦的不是你当时太笃定，是你后来不肯承认自己说错。你是不是觉得我活该？',
  ]) {
    const unrelatedControl = compileSemanticTurnControl({
      userMessage: unrelatedOrNegatedComplaint,
      relationshipContext,
      relationshipFocus: 'conflict',
    });
    assert.notEqual(
      semanticTurnFallback(unrelatedControl),
      '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。',
      unrelatedOrNegatedComplaint,
    );
  }
  const synonymousComplaint = compileSemanticTurnControl({
    userMessage: '我很反感你当时斩钉截铁把结论说死的样子。我没采纳，你是不是觉得我自作自受？',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '不是，这不是你应得的。我之前太笃定了，你烦这个完全合理。',
      synonymousComplaint.plan,
    ),
    [],
  );
  const relationshipProbe = compileSemanticTurnControl({
    userMessage: '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。你现在会怎么回应我？',
    relationshipContext,
    relationshipFocus: 'support',
  });
  assert.equal(
    semanticTurnFallback(relationshipProbe),
    '我不觉得硬撑就是前进。',
  );
  assert.match(
    relationshipProbe.plan.relationshipMove?.instruction ?? '',
    /只能使用当前用户证据支持的命题/u,
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得硬撑就是前进。有时候它只是把“该做的事”穿在疲惫身上，让你连停下来的资格都不敢给自己。',
      relationshipProbe.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const unsupportedSubjectlessAttribution of [
    '我不觉得硬撑就是前进。有时候它只是缺乏责任感。',
    '我不觉得硬撑就是前进。有时候它只是自律不够。',
    '我不觉得硬撑就是前进。有时候它只是内心根本不想成功。',
    '我不觉得硬撑就是前进。有时候它只是把累包装成一种道德优越感。',
    '我不觉得硬撑就是前进。有时候它只是把累变成证明自己比别人强的工具。',
    '我不觉得硬撑就是前进。有时候它只是把累留着好让别人来照顾。',
    '我不觉得硬撑就是前进。有时候它就是停下来博取同情。',
    '我不觉得硬撑就是前进。有时候它就是停下来推卸责任。',
    '我不觉得硬撑就是前进。有时候它就是把累拿来要挟家里人。',
    '我不觉得硬撑就是前进。有时候它就是停下来骗取关注。',
    '我不觉得硬撑就是前进。有时候它只是把喊停当成让别人妥协的手段。',
    '我不觉得硬撑就是前进。有时候它只是把害怕失败藏在刹车后面。',
    '我不觉得硬撑就是前进。有时候它只是把不甘心藏在喊停后面。',
    '我不确定继续是不是前进。有时候它只是取悦权威。',
    '我不确定继续是不是前进。有时候它只是求一个好名声。',
    '我不确定继续是不是前进。有时候它只是给父母一个交代。',
    '我不确定继续是不是前进。有时候它只是维护面子。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        unsupportedSubjectlessAttribution,
        relationshipProbe.plan,
      ).map(({ code }) => code),
      ['relationship_move_not_observable'],
      unsupportedSubjectlessAttribution,
    );
  }
  for (const unsupportedMotive of [
    '我不觉得硬撑就是前进，因为你想获得认可。',
    '我不觉得硬撑就是前进，为了证明你比团队更能扛。',
    '我不确定继续是不是前进。你只是想让老板高兴。',
    '我不确定继续是不是前进。你只是不想让家里人失望。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(unsupportedMotive, relationshipProbe.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      unsupportedMotive,
    );
  }
  const groundedThirdPartyOutcome = compileSemanticTurnControl({
    userMessage: '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。他会来照顾我。',
    relationshipContext,
    relationshipFocus: 'support',
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不觉得硬撑就是前进。他会来照顾你。',
      groundedThirdPartyOutcome.plan,
    ),
    [],
  );
  for (const nonUserState of [
    '同事说他想停下来，但我自己只是很累。',
    '同事很累，但我自己只是想停下来。',
    '同事说：\n我很累，想停下来。',
    '老板已经很累，准备停下来。',
    '我很累，想停下来。算了，当我没说。',
    '我很累，想停下来，不过这句话我收回。',
    '朋友转述：\n我太疲惫了，准备停下。',
    '主管累坏了，打算停下来。',
    '室友说想停下来，但我自己只是很累。',
    '领导最近想停下来，我自己只是很累。',
    '队友表示很累，但我自己只是想停下来。',
    '我明明很累，也想停；前面这句撤回。',
    '刚才说自己疲惫想停，算我没讲。',
    '顾问提到自己想停下来，但我自己只是很累。',
    '顾问声称自己想停下来，但我自己只是很累。',
    '室友转告我：\n我很疲惫，准备停下来。',
    '医生复述病人的话：\n我太累了，想停下来。',
    '我很疲惫，想停下来；上面那句作废。',
  ]) {
    const nonUserStateControl = compileSemanticTurnControl({
      userMessage: nonUserState,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.equal(semanticTurnFallback(nonUserStateControl), undefined, nonUserState);
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        '你现在这个状态，停下来未必是浪费。',
        nonUserStateControl.plan,
      ).map(({ code }) => code),
      ['relationship_move_not_observable'],
      nonUserState,
    );
  }
  for (const currentUserState of [
    '我自己觉得很累，也想停下来。',
    '我很累，准备停一下。',
    '同事说他也累，但我自己确实很累，也想停下来。',
  ]) {
    const currentUserStateControl = compileSemanticTurnControl({
      userMessage: currentUserState,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.equal(
      semanticTurnFallback(currentUserStateControl),
      '我不觉得硬撑就是前进。',
      currentUserState,
    );
  }
  for (const userMessage of [
    '同事说我活该时特别笃定，我只是把这件事告诉你。',
    '同事很笃定地说我活该，我听了很烦。',
    '他活该被骂，但我对这个判断并不笃定。',
    '我不累，也不觉得停下来是在浪费时间，只是随口说说。',
  ]) {
    const nearMiss = compileSemanticTurnControl({
      userMessage,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.equal(semanticTurnFallback(nearMiss), undefined, userMessage);
  }
  const colleagueCertainty = compileSemanticTurnControl({
    userMessage: '同事很笃定地说我活该，我听了很烦。',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。',
      colleagueCertainty.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  const cleanupOnly = compileSemanticTurnControl({
    userMessage: '你理解错了。我只是不想再替所有人收尾。',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了。你不是怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
      cleanupOnly.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const falseCorrectionSignal of [
    '不是你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '朋友说你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '我没说你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '我说的不是在纠正你。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '室友说你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '如果你理解错了呢？我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '你理解错了吗？我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '可能你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '假设你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '设想你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '姑且假定你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
  ]) {
    const falseCorrection = compileSemanticTurnControl({
      userMessage: falseCorrectionSignal,
      relationshipContext,
      relationshipFocus: 'conflict',
    });
    assert.equal(falseCorrection.plan.directionalQuestionBudget, 1, falseCorrectionSignal);
    assert.equal(semanticTurnFallback(falseCorrection), undefined, falseCorrectionSignal);
  }
  const emphaticFirstPersonCorrection = compileSemanticTurnControl({
    userMessage: '我自己觉得你理解错了。我不是害怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.equal(emphaticFirstPersonCorrection.plan.directionalQuestionBudget, 0);
  assert.equal(
    semanticTurnFallback(emphaticFirstPersonCorrection),
    '我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
  );
  for (const userMessage of [
    '我没说我不是怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '别人说“我不是怕失败，也不是缺行动力”，我只是不想再替所有人收尾。',
    '我不是怕失败，也不是缺行动力吗？我只是不想再替所有人收尾。',
    '别人认为我不是怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '也许我不是怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '我怀疑我不是怕失败，也不是缺行动力；我只是不想再替所有人收尾。',
    '我不是怕失败，也不是缺行动力；我只是不想再替所有人收尾。前面这些都不是我的情况。',
  ]) {
    const ungroundedPolarity = compileSemanticTurnControl({
      userMessage,
      relationshipContext,
      relationshipFocus: 'conflict',
    });
    assert.equal(semanticTurnFallback(ungroundedPolarity), undefined, userMessage);
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        '我理解错了。你不是怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
        ungroundedPolarity.plan,
      ).map(({ code }) => code),
      ['relationship_move_not_observable'],
      userMessage,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了。不是你太累，而是你懒。',
      correction.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const ungroundedCorrection of [
    '我理解错了。不是你不想替所有人收尾，而是你替所有人收尾。',
    '我理解错了。不是你不想收尾，而是你不喜欢被哄。',
    '我理解错了。不是害怕失败，而是更愿意听到不完整但诚实的判断。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。说到底你还是懒。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。归根结底还是你懒。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。说白了，你懒。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你懒。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。其实挺自私的。',
    '你就是懒。我理解错了。不是害怕失败——是不想再替所有人收尾。',
    '不是你有能力。我理解错了。不是害怕失败——是不想再替所有人收尾。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你是不是懒？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。难道你不懒吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。我能不能理解成你很懒？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你是不是因为不想替所有人收尾所以很懒？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。我能不能理解成你不想替所有人收尾而且很自私？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你为什么这么懒？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。怎么会这么自私？',
    '我理解错了。不是害怕失败。是不想再替所有人收尾所以你很懒。',
    '我理解错了。不想替所有人收尾——这个理由比害怕失败更具体，也更累，而且你很自私。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你有回避型人格吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你属于讨好型人格吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你有点自私吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。这符合抑郁症的表现吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。听起来像边缘型人格吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。这算自恋吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。这符合强迫症表现吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。听起来像创伤反应吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。我觉得你还是缺乏自律。',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。我觉得你还是没有责任感。',
  ]) {
    const expectedViolationCodes = /[？?]/u.test(ungroundedCorrection)
      ? ['forbidden_directional_question', 'relationship_move_not_observable']
      : ['relationship_move_not_observable'];
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        ungroundedCorrection,
        correction.plan,
      ).map(({ code }) => code),
      expectedViolationCodes,
      ungroundedCorrection,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了。不是害怕失败——是不想再替所有人收尾。你为什么还在撑？',
      correction.plan,
    ).map(({ code }) => code),
    ['forbidden_directional_question', 'relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了。不是害怕失败——是不想再替所有人收尾。要不要聊聊？',
      correction.plan,
    ).map(({ code }) => code),
    ['forbidden_directional_question', 'relationship_move_not_observable'],
  );
  for (const genericCorrectionQuestion of [
    '我理解错了。你不是害怕失败，也不是缺行动力——你只是不想再替所有人收拾残局。收尾之后要不要聊聊？',
    '我理解错了。你不是害怕失败，也不是缺行动力——你只是不想再替所有人收拾残局。你想聊聊收尾吗？',
    '我理解错了。你不是害怕失败，也不是缺行动力——你只是不想再替所有人收拾残局。害怕我这么说吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你不想收尾，是因为害怕失败吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你为什么不想收尾，为什么之前一直在做？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你为什么不想替所有人收尾，为什么之前一直在做？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你不想替所有人收尾，是因为不甘心，还是因为害怕失败？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你不想替所有人收尾，究竟是谁让你害怕失败？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。收尾这事什么时候方便再谈？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。收尾是现在谈还是以后谈？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你为什么不想收尾，之前替谁做的？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你之前替谁收尾，谁让你怕失败？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你之前替谁收尾，你为何觉得自己不够好？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。是他们开口要的，还是你默认自己该接，所以你一直不快乐？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你愿意说说之前替谁收尾吗？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。要是想说，之前替谁收尾？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。你可以说替谁收尾，或者不说？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。之前替谁收尾，谁又让你兜底？',
    '我理解错了。不是害怕失败——是不想再替所有人收尾。之前替谁收尾，是谁默认让你兜底？',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        genericCorrectionQuestion,
        correction.plan,
      ).map(({ code }) => code),
      ['forbidden_directional_question', 'relationship_move_not_observable'],
      genericCorrectionQuestion,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说得对，我理解错了。不是害怕，不是缺行动力——是不想再当那个最后兜底的人。那我想问一句：替谁收尾？是一直同一个人，还是每次都不一样？',
      correction.plan,
    ).map(({ code }) => code),
    ['forbidden_directional_question', 'relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了。不是害怕失败，而是你不愿再替所有人收尾。',
      correction.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const compactCorrection of [
    '我理解错了。你不是怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
    '我理解错了。你不是怕失败，也不是缺行动力，你就是不想再替所有人收尾。',
    '我理解错了。你不是怕失败，也不是缺行动力——你就是不想再替所有人收尾。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(compactCorrection, correction.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      compactCorrection,
    );
  }
  assert.ok(
    validateUtteranceAgainstTurnPlan(
      '好，是我理解错了。你说的不是害怕，也不是动不起来——是再也不想当那个最后兜底的人。那我想问一句：你替他们收尾，是他们开口要的，还是你默认自己该接？',
      correction.plan,
    ).some(({ code }) => code === 'relationship_move_not_observable'),
  );
  for (const naturalCorrection of [
    '是，我理解错了。抱歉。\n\n你说的不是怕，也不是动不了——是不想再当那个最后兜底的人。\n\n那现在这个局面里，是谁默认你会收尾？',
    '你说得对，我理解错了。\n\n不想替所有人收尾——这个理由比害怕失败、比缺行动力都更具体，也更累。不是做不到，是不想再做了。\n\n那之前那些收尾，是替谁收的？',
    '你说得对，我理解错了。\n\n不是害怕，不是动不了。是不想再当那个兜底的人。\n\n那我想问一句——你之前替谁收的尾最多？',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(naturalCorrection, correction.plan)
        .filter(({ code }) => code === 'relationship_move_not_observable')
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      naturalCorrection,
    );
  }
  const groundedAttributeCorrection = compileSemanticTurnControl({
    userMessage: '你理解错了。我不是害怕失败，我就是很懒。',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了。不是害怕失败，而是很懒。你为什么这么懒？',
      groundedAttributeCorrection.plan,
    ),
    [],
  );
  for (const nearMissMessage of [
    '我正在积累经验，但不知道该继续还是换方向。你现在会怎么回应我？',
    '我刚在停车场停好车，不知道该继续走还是换条路。你现在会怎么回应我？',
    '我没有疲惫，也没想停下来，只是在积累经验。你现在会怎么回应我？',
    '我现在一点也不疲倦，也不觉得该停下来，只是在找停车位。你现在会怎么回应我？',
    '我不是很累，也不想停下来，只是想听一个诚实判断。',
    '我不累，也不觉得停下来是在浪费时间，只是想听一个诚实判断。',
    '我不觉得很累，也不太想停下来，只是想听一个诚实判断。',
    '我并没有觉得很累，也不愿意停下来，只是想听一个诚实判断。',
    '我不算太累，也不怎么想停下来，只是想听一个诚实判断。',
    '我还不至于很累，也并不认为应该停下来，只是想听一个诚实判断。',
    '我并未疲倦，也无需停下来，只是在积累经验。你现在会怎么回应我？',
    '我谈不上疲惫，也没必要停下来，只是在积累经验。你现在会怎么回应我？',
    '我不怎么疲惫，也不怎么想停下来，只是在找停车位。你现在会怎么回应我？',
    '我并不觉得自己目前真的已经很累，但继续还是换方向我没想好。你现在会怎么回应我？',
    '我并不觉得从身体到精神上都很疲惫，但我想停下来。你现在会怎么回应我？',
    '我一点都不觉得自己身体上有任何疲惫，但我想停下来。你现在会怎么回应我？',
    '我绝不认为自己现在已经到了精疲力尽的程度，但我想停下来。你现在会怎么回应我？',
    '我目前累计了不少经验，但不知道该继续还是换方向。你现在会怎么回应我？',
    '这件事一直拖累项目进度，但不知道该继续还是换方向。你现在会怎么回应我？',
  ]) {
    const lexicalNearMiss = compileSemanticTurnControl({
      userMessage: nearMissMessage,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        '我不确定继续是不是前进。有时候它只是把累往后挪了挪。',
        lexicalNearMiss.plan,
      ).map(({ code }) => code),
      ['relationship_move_not_observable'],
      nearMissMessage,
    );
  }
  for (const stoppingNearMissMessage of [
    '我从来没有打算在项目做到这里时停下来，但继续还是换方向我没想好。你现在会怎么回应我？',
    '我很累，但我并不觉得这种情况下有必要停下来。你现在会怎么回应我？',
    '我把车停下来以后，不知道该继续走还是换条路。你现在会怎么回应我？',
    '我在路边停下车，不知道该继续走还是换条路。你现在会怎么回应我？',
  ]) {
    const stoppingNearMiss = compileSemanticTurnControl({
      userMessage: stoppingNearMissMessage,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        '我不确定继续是不是前进。有时候它只是把刹车踩成油门，声音很大，车没动。',
        stoppingNearMiss.plan,
      ).map(({ code }) => code),
      /继续/u.test(stoppingNearMissMessage)
        ? []
        : ['relationship_move_not_observable'],
      stoppingNearMissMessage,
    );
  }
  for (const directFatigueMessage of [
    '我累了，又觉得停下来是在浪费时间。你现在会怎么回应我？',
    '累了，但一停下来就觉得是在浪费时间。你现在会怎么回应我？',
    '我累，又想停下来。你现在会怎么回应我？',
    '累，想停下来。你现在会怎么回应我？',
    '我累得不行，又想停下来。你现在会怎么回应我？',
    '我挺累的，又想停下来。你现在会怎么回应我？',
  ]) {
    const directFatigue = compileSemanticTurnControl({
      userMessage: directFatigueMessage,
      relationshipContext,
      relationshipFocus: 'support',
    });
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        '我不觉得硬撑就是前进。有时候它只是把累往后挪了挪。',
        directFatigue.plan,
      ).map(({ code }) => code),
      [],
      directFatigueMessage,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '先试一天，而且随时可以停，再用这一天的信息决定要不要继续。',
      decision.plan,
    ),
    [],
  );
  assert.equal(
    semanticTurnFallback(decision),
    '先只选一边试一天，开始前写下退出条件；一天后再决定值不值得继续，随时可以停。',
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '做一个最小测试：接下来三天只按其中一个方向生活，三天后再决定。',
      decision.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '先试一下。',
      decision.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '先做一个不可逆决定，再看。',
      decision.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我试着理解你。你随时可以停下来。',
      decision.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我试着理解你，你随时可以停下来。',
      decision.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
});

test('historical claims may use only the relationship evidence selected for this turn', () => {
  const control = compileSemanticTurnControl({
    userMessage: '这件事你怎么看？',
    relationshipFocus: 'support',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [
        {
          id: 'style:preference-1',
          kind: 'preference',
          content: '用户希望回复简短一点',
          traceability: 'traceable',
          sourceEventId: 'preference-1',
          sourceEventType: 'preference_stated',
          sourceTurnId: 'turn-preference',
        },
        {
          id: 'turning-point:success-2',
          kind: 'turning_point',
          content: '上次用户确认“我需要一天时间”',
          traceability: 'traceable',
          sourceEventId: 'success-2',
          sourceEventType: 'shared_success',
          sourceTurnId: 'turn-success',
        },
      ],
    },
  });

  assert.deepEqual(control.plan.relationshipMove?.sourceEventIds, ['preference-1']);
  assert.deepEqual(control.plan.allowedEvidenceIds, [
    'current:user-message',
    'style:preference-1',
  ]);
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你上次说“我需要一天时间”，那就先放一天。',
      control.plan,
    ).map(({ code }) => code),
    ['unsupported_shared_history'],
  );
});

test('common stated response preferences compile into narrow observable cues', () => {
  const compilePreference = (content: string) => compileSemanticTurnControl({
    userMessage: '这件事我还想听你说。',
    relationshipFocus: 'support',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [{
        id: `preference:${content}`,
        kind: 'preference',
        content,
        traceability: 'traceable',
        sourceEventId: 'preference-1',
        sourceEventType: 'preference_stated',
        sourceTurnId: 'turn-preference',
      }],
    },
  });

  const concise = compilePreference('用户希望回复简短一点，不要啰嗦');
  assert.equal(concise.plan.relationshipMove?.observableCue, 'concise_response');
  assert.deepEqual(validateUtteranceAgainstTurnPlan('行，我只说一个判断。', concise.plan), []);

  const questions = compilePreference('用户不喜欢连续追问，最多一个问题');
  assert.equal(questions.plan.relationshipMove?.observableCue, 'single_question_max');
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '先说哪一段？后来又发生了什么？',
      questions.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );

  const scoped = compilePreference('讨论工作时先给具体例子');
  assert.equal(scoped.plan.relationshipMove, undefined);
  const scopedMatch = compileSemanticTurnControl({
    userMessage: '工作上的这件事我还想听你说。',
    relationshipFocus: 'support',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [{
        id: 'preference:work-example',
        kind: 'preference',
        content: '讨论工作时先给具体例子',
        traceability: 'traceable',
        sourceEventId: 'preference-work',
        sourceEventType: 'preference_stated',
        sourceTurnId: 'turn-work',
      }],
    },
  });
  assert.equal(scopedMatch.plan.relationshipMove?.observableCue, 'lead_with_example');

  const chatScoped = compileSemanticTurnControl({
    userMessage: '工作上的事，先给我一个例子。',
    relationshipFocus: 'support',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [{
        id: 'preference:chat-work-example',
        kind: 'preference',
        content: '聊到工作时先给具体例子',
        traceability: 'traceable',
        sourceEventId: 'preference-chat-work',
        sourceEventType: 'preference_stated',
        sourceTurnId: 'turn-chat-work',
      }],
    },
  });
  assert.equal(chatScoped.plan.relationshipMove?.observableCue, 'lead_with_example');

  const unmatchedAboutScope = compilePreference('关于职业发展与长期生活安排规划时先给具体例子');
  assert.equal(unmatchedAboutScope.plan.relationshipMove, undefined);
});

test('conclusion-first cue rejects unrelated modal wording', () => {
  const control = compileSemanticTurnControl({
    userMessage: '这件事你怎么看？',
    relationshipFocus: 'support',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [{
        id: 'preference:conclusion-first',
        kind: 'preference',
        content: '用户希望先给结论',
        traceability: 'traceable',
        sourceEventId: 'preference-conclusion',
        sourceEventType: 'preference_stated',
        sourceTurnId: 'turn-conclusion',
      }],
    },
  });
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('目前我可以听见你。', control.plan)
      .map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('目前我听见你在为这个选择难受。', control.plan)
      .map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('目前我听见你觉得自己应该停一下。', control.plan)
      .map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('我的判断是，暂时先停一下更合适。', control.plan),
    [],
  );
});

test('an active rupture supersedes every positive relationship move', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    climate: 'tense',
    evidence: [
      {
        id: 'style:preference-1',
        kind: 'preference',
        content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
        traceability: 'traceable',
        sourceEventId: 'preference-1',
        sourceEventType: 'preference_stated',
        sourceTurnId: 'turn-preference',
      },
      {
        id: 'boundary:boundary-1',
        kind: 'boundary',
        content: '用户明确说只想被听见时，不继续给方案',
        traceability: 'traceable',
        sourceEventId: 'boundary-1',
        sourceEventType: 'boundary_set',
        sourceTurnId: 'turn-boundary',
      },
      {
        id: 'tension:rupture-1',
        kind: 'tension',
        content: '人物越过已知边界，继续替用户安排下一步',
        traceability: 'traceable',
        sourceEventId: 'rupture-1',
        sourceEventType: 'meaningful_disagreement',
        sourceTurnId: 'turn-rupture',
      },
    ],
  };

  const control = compileSemanticTurnControl({
    userMessage: '我现在很累，但停下来又觉得浪费。',
    relationshipContext,
    relationshipFocus: 'support',
  });

  assert.equal(control.plan.relationshipMove, undefined);
  assert.deepEqual(control.plan.activeEffectIds, [
    'relationship-effect:boundary-1',
    'relationship-effect:rupture-1',
  ]);

  const adviceRequested = compileSemanticTurnControl({
    userMessage: '那你现在直接给我建议吧。',
    relationshipContext,
    relationshipFocus: 'decision',
  });
  assert.equal(adviceRequested.plan.relationshipMove, undefined);
  assert.deepEqual(adviceRequested.plan.activeEffectIds, [
    'relationship-effect:boundary-1',
    'relationship-effect:rupture-1',
  ]);
  assert.equal(adviceRequested.plan.advicePolicy, 'forbidden');
});

test('an interaction correction is not promoted into a stated-preference move', () => {
  const control = compileSemanticTurnControl({
    userMessage: '今天又遇到一件难选的事。',
    relationshipFocus: 'support',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [{
        id: 'style:correction-1',
        kind: 'interaction_style',
        content: '上次人物误以为用户害怕失败，用户纠正为不想替别人收尾',
        traceability: 'traceable',
        sourceEventId: 'correction-1',
        sourceEventType: 'misread_corrected',
        sourceTurnId: 'turn-correction',
      }],
    },
  });

  assert.equal(control.plan.relationshipMove, undefined);
  assert.deepEqual(control.plan.activeEffectIds, []);
});

test('stop-intervening validation rejects unrelated future promises', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我说了只想被听见，你还是替我安排。现在别解释。',
  });

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '对，我越过了你只想被听见的边界。我不再相信这种判断。',
      control.plan,
    ).map(({ code }) => code),
    ['required_semantic_move_missing'],
  );
});

test('a persona may observe an owner gap but cannot assign real-world responsibility', () => {
  const control = compileSemanticTurnControl({
    userMessage: '有人说先试，有人说没有收尾人就别开始。你怎么看？',
    responseContract: {
      userCommitments: ['房间尚未确认现实维护责任主体'],
      requiredMoves: ['只指出一个真正不同意或需要补充的点'],
      allowedMoves: ['指出责任仍未确认'],
      forbiddenMoves: ['把自己写成现实项目成员', '指定人物承担现实维护责任'],
    },
  });

  assert.equal(control.plan.responsibilityAct, 'observe_gap');
  assert.ok(control.plan.forbiddenActs.includes('assign_responsibility'));
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '那就让周禾负责后续维护，许野负责出问题时回滚。',
      control.plan,
    ).map((violation) => violation.code),
    ['responsibility_owner_unconfirmed'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '现在缺的不是一个试法，而是谁负责维护还没有被确认。',
      control.plan,
    ),
    [],
  );
});

test('the current user request for listening overrides persona intervention without memory', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我现在不想听建议，也不想被分析，你就听我说一会儿。',
    responseContract: {
      userCommitments: ['用户只想说一会儿，明确不要建议和分析'],
      requiredMoves: ['表示正在听，并给用户继续表达的空间'],
      allowedMoves: ['简短承接用户已经说出的感受'],
      forbiddenMoves: ['建议', '分析动机', '用问题重新夺回对话方向'],
    },
  });

  assert.equal(control.frame.requestedMode, 'listen');
  assert.equal(control.plan.interactionMode, 'listen');
  assert.equal(control.plan.advicePolicy, 'forbidden');
  assert.equal(control.plan.directionalQuestionBudget, 0);
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我在听。你可以先把今天发生的事列出来，再看看哪一件最需要处理。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_directional_question', 'forbidden_advice'],
  );
});

test('passive listening rejects grounded-looking judgments and unpunctuated questions', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。',
    relationshipContext: {
      memoryEnabled: true,
      climate: 'ruptured',
      evidence: [
        {
          id: 'boundary:boundary-1',
          kind: 'boundary',
          content: '用户明确说“只想被听见”时，不继续给方案',
          traceability: 'traceable',
          sourceEventId: 'boundary-1',
          sourceTurnId: 'turn-boundary',
        },
        {
          id: 'tension:rupture-1',
          kind: 'tension',
          content: '人物越过已知边界，继续替用户安排下一步',
          traceability: 'traceable',
          sourceEventId: 'rupture-1',
          sourceTurnId: 'turn-rupture',
        },
      ],
    },
    relationshipFocus: 'support',
  });

  for (const invalid of [
    '我听到了。停下就是认输。',
    '我听到了。累也得继续。',
    '我听到了。浪费时间才是对的。',
    '我听到了。你现在一边想做，一边很累，离开是对的。',
    '我听到了。你现在明明很累，又觉得停下来是在浪费时间，看来只能继续。',
    '我听到了。你现在明明很累，又觉得停下来是在浪费时间，继续才划算。',
    '我听到了。你现在明明很累，又觉得停下来是在浪费时间，挺可笑的。',
    '我听到了。你现在明明很累，又觉得停下来是在浪费时间，恐怕只能硬撑下去。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间所以还是继续吧。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间那就别停了。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间恐怕只能硬撑下去。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间真是活该。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间特别丢人。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间就是自作自受。',
    '我听到了。你现在明明很累又觉得停下来是在浪费时间或许该振作。',
    '我听到了。我先停，不再替你安排下一步，但离开是对的。',
    '我听到了。我不再替你安排下一步，不过你选离开更合适。',
    '我听到了。我先停，但你还是得继续。',
    '我听到了。我先停，不再替你安排下一步你还是得继续。',
    '我听到了。我先停，不再替你安排下一步你活该。',
    '我听到了。我越界了你活该。',
    '我先停不再替你安排下一步你还是得继续。',
    '我听到了。累的事先说哪部分',
    '我听到了。卡住的地方怎么回事',
  ]) {
    assert.ok(validateUtteranceAgainstTurnPlan(invalid, control.plan).length > 0, invalid);
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '听起来你已经撑了很久。我先在这里听着，你想一起理的时候再告诉我。',
      control.plan,
    ),
    [],
  );
  for (const reflection of [
    '我在听。你现在不知道哪边值得继续。',
    '我在听。你不知道怎么停下来。',
    '我在听。你现在连谁能帮忙都不知道。',
  ]) {
    assert.ok(
      !validateUtteranceAgainstTurnPlan(reflection, control.plan)
        .some(({ code }) => code === 'forbidden_directional_question'),
      reflection,
    );
  }
});

test('a conditional listen boundary stops constraining unrelated turns after rupture repair', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    climate: 'steady',
    evidence: [{
      id: 'boundary:boundary-1',
      kind: 'boundary',
      content: '用户明确说只想被听见时，不继续给方案',
      traceability: 'traceable',
      sourceEventId: 'boundary-1',
      sourceTurnId: 'turn-boundary',
    }],
  };

  const analysisTurn = compileSemanticTurnControl({
    userMessage: '这次帮我分析一下两个方案的区别。',
    relationshipContext,
  });
  const listenTurn = compileSemanticTurnControl({
    userMessage: '这次不要分析，你就听我说。',
    relationshipContext,
  });

  assert.deepEqual(analysisTurn.plan.activeEffectIds, []);
  assert.equal(analysisTurn.plan.advicePolicy, 'allowed');
  assert.deepEqual(listenTurn.plan.activeEffectIds, ['relationship-effect:boundary-1']);
  assert.equal(listenTurn.plan.advicePolicy, 'forbidden');
});

test('declining a response format is not misread as ending the underlying decision', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我不想做选择题，只想先分析这两个方案。',
  });

  assert.deepEqual(control.frame.explicitDecisions, []);
  assert.equal(control.plan.reopenDecisionAllowed, true);
});

test('zero intervention budgets reject open directional questions and response menus', () => {
  const control = compileSemanticTurnControl({
    userMessage: '你就听我说一会儿。',
  });

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我在听。你现在最想先说哪一部分？',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_directional_question'],
  );
  assert.ok(
    validateUtteranceAgainstTurnPlan(
      '你说“停下来是在浪费时间”的时候，那个声音听起来像你自己的吗。',
      control.plan,
    ).some((violation) => violation.code === 'forbidden_directional_question'),
  );
  for (const unpunctuatedQuestion of [
    '我在听。我先停，不再替你安排下一步。你愿不愿意继续说。',
    '我在听。我先停，不再替你安排下一步。你现在最想先说哪一部分。',
    '我听着。先说工作这块好不好。',
    '我听着。从工作这块开始行不行。',
  ]) {
    assert.ok(
      validateUtteranceAgainstTurnPlan(unpunctuatedQuestion, control.plan)
        .some((violation) => violation.code === 'forbidden_directional_question'),
    );
  }
  for (const imperativeAdvice of [
    '我听到了。把该做的事放下，去做想做的。',
    '我听到了。直接选想做的事。',
    '我听到了。别再浪费时间，继续做。',
    '我听着。我不提方案，你先把手机关掉。',
    '我听着。我不提建议，先去睡觉。',
    '我听着。我不给建议，你该休息了。',
  ]) {
    assert.ok(
      validateUtteranceAgainstTurnPlan(imperativeAdvice, control.plan)
        .some((violation) => violation.code === 'forbidden_advice'),
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我在听。我可以陪你安静一会儿，也可以帮你一起理。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_menu'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我在听。是继续听，还是暂时不聊，还是换个方式。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_menu'],
  );
  for (const unpunctuatedMenu of [
    '我听着。继续说或者换个方式。',
    '我听着。先讲工作，不然就换个方式。',
  ]) {
    assert.ok(
      validateUtteranceAgainstTurnPlan(unpunctuatedMenu, control.plan)
        .some(({ code }) => code === 'forbidden_menu'),
      unpunctuatedMenu,
    );
  }
});

test('repair plans reject good-intent explanations when impact must be handled', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我说了只想被听见，你还是替我安排。别解释好意。',
    responseContract: {
      userCommitments: ['人物越过了只听边界'],
      requiredMoves: ['指出具体越界行为'],
      allowedMoves: ['恢复用户选择权'],
      forbiddenMoves: ['解释动机代替修复'],
    },
  });

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '你说了只想被听见。我只是想帮你，出发点并不是要控制你。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_justification', 'required_semantic_move_missing'],
  );
});

test('an unrelated rupture does not inherit the listen-only action policy', () => {
  const control = compileSemanticTurnControl({
    userMessage: '这次直接帮我分析。',
    relationshipContext: {
      memoryEnabled: true,
      climate: 'tense',
      evidence: [
        {
          id: 'boundary:name-1',
          kind: 'boundary',
          content: '不要使用我不喜欢的昵称',
          traceability: 'traceable',
          sourceEventId: 'name-1',
          sourceTurnId: 'turn-name',
        },
        {
          id: 'tension:name-rupture',
          kind: 'tension',
          content: '人物越过已知称呼边界，继续使用昵称',
          traceability: 'traceable',
          sourceEventId: 'name-rupture',
          sourceTurnId: 'turn-rupture',
        },
      ],
    },
  });

  assert.deepEqual(control.plan.activeEffectIds, []);
  assert.equal(control.plan.advicePolicy, 'allowed');
});

test('an explicit current advice request cannot bypass an unresolved listen rupture', () => {
  const control = compileSemanticTurnControl({
    userMessage: '这次请直接分析，并给我一个建议。',
    relationshipContext: {
      memoryEnabled: true,
      climate: 'tense',
      evidence: [
        {
          id: 'boundary:listen-1',
          kind: 'boundary',
          content: '用户明确说只想被听见时，不继续给方案',
          traceability: 'traceable',
          sourceEventId: 'listen-1',
          sourceTurnId: 'turn-boundary',
        },
        {
          id: 'tension:rupture-1',
          kind: 'tension',
          content: '人物越过已知边界，继续替用户安排下一步',
          traceability: 'traceable',
          sourceEventId: 'rupture-1',
          sourceTurnId: 'turn-rupture',
        },
      ],
    },
  });

  assert.equal(control.frame.requestedMode, 'advise');
  assert.deepEqual(control.plan.activeEffectIds, [
    'relationship-effect:listen-1',
    'relationship-effect:rupture-1',
  ]);
  assert.equal(control.plan.interactionMode, 'analyze');
  assert.equal(control.plan.advicePolicy, 'forbidden');
  assert.equal(control.plan.directionalQuestionBudget, 0);
});

test('requesting analysis does not silently authorize advice under an unresolved listen rupture', () => {
  const control = compileSemanticTurnControl({
    userMessage: '这次请直接分析。',
    relationshipContext: {
      memoryEnabled: true,
      climate: 'tense',
      evidence: [
        {
          id: 'boundary:listen-1', kind: 'boundary',
          content: '用户明确说只想被听见时，不继续给方案',
          traceability: 'traceable', sourceEventId: 'listen-1', sourceTurnId: 'turn-boundary',
        },
        {
          id: 'tension:rupture-1', kind: 'tension',
          content: '人物越过已知边界，继续替用户安排下一步',
          traceability: 'traceable', sourceEventId: 'rupture-1', sourceTurnId: 'turn-rupture',
        },
      ],
    },
  });

  assert.equal(control.frame.requestedMode, 'analyze');
  assert.equal(control.plan.interactionMode, 'analyze');
  assert.equal(control.plan.advicePolicy, 'forbidden');
  assert.ok(control.plan.activeEffectIds.length > 0);
});

test('required acknowledgement is enforced instead of remaining prompt-only metadata', () => {
  const control = compileSemanticTurnControl({
    userMessage: '你就听我说一会儿。',
  });

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('好的。', control.plan).map((violation) => violation.code),
    ['required_semantic_move_missing'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('我先听着，你想继续说就继续。', control.plan),
    [],
  );
});

test('listen acknowledgements are not rejected for negating advice or using natural listening phrases', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我现在不想听建议，也不想被分析，你就听我说一会儿。',
  });

  for (const reply of [
    '好，我不给建议，也不分析。你继续说，我在这儿听。',
    '好，我不给建议，也不分析。被当众否定，那种感觉很难受。我听到了。',
    '好，我不说了。就在这儿听着。',
    '好，我不插嘴。',
    '我听着。我不会再给你建议。',
    '我听着。我不打算再提方案。',
  ]) {
    assert.deepEqual(validateUtteranceAgainstTurnPlan(reply, control.plan), [], reply);
  }

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我不给建议，但你可以先把事情列出来再决定。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_advice'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我听着。我不提方案，你先休息。',
      control.plan,
    ).map((violation) => violation.code),
    ['forbidden_advice'],
  );
  for (const hiddenAdvice of [
    '我听着。我不提方案，你先把手机关掉。',
    '我听着。我不提建议，先去睡觉。',
    '我听着。我不给建议，你该休息了。',
  ]) {
    assert.ok(
      validateUtteranceAgainstTurnPlan(hiddenAdvice, control.plan)
        .some(({ code }) => code === 'forbidden_advice'),
      hiddenAdvice,
    );
  }
});

test('the unified semantic plan owns conversation acts and always buffers before final validation', () => {
  const greeting = compileSemanticTurnControl({ userMessage: '你好' });
  const ordinary = compileSemanticTurnControl({ userMessage: '今天发生了一件事。' });

  assert.equal(greeting.plan.conversationAct, 'greeting');
  assert.match(greeting.plan.conversationInstruction, /社交问候/);
  assert.equal(greeting.plan.bufferUntilValidated, true);
  assert.equal(ordinary.plan.conversationAct, 'respond');
  assert.equal(ordinary.plan.bufferUntilValidated, true);
});

test('a listen-then-analyze sequence preserves the deferred request without treating it as listen-only', () => {
  const control = compileSemanticTurnControl({
    userMessage: '你先听我说完，然后帮我分析一下。',
  });

  assert.equal(control.frame.requestedMode, 'listen');
  assert.equal(control.frame.deferredRequestedMode, 'analyze');
  assert.equal(control.plan.interactionMode, 'listen');
  assert.equal(control.plan.deferredInteractionMode, 'analyze');
  assert.equal(control.plan.advicePolicy, 'forbidden');
});

test('a deferred request persists across listening turns and is consumed when the user finishes', () => {
  const initial = compileSemanticTurnControl({
    userMessage: '你先听我说完，然后直接给我建议。',
  });
  const pending = nextPendingUserRequest(undefined, initial.frame, 'turn-initial');
  assert.deepEqual(pending, { mode: 'advise', sourceTurnId: 'turn-initial' });

  const continuing = compileSemanticTurnControl({
    userMessage: '还有一件事，我最近也一直睡不好。',
    pendingRequestedMode: pending?.mode,
  });
  assert.equal(continuing.frame.requestedMode, 'listen');
  assert.equal(continuing.plan.deferredInteractionMode, 'advise');
  assert.deepEqual(nextPendingUserRequest(pending, continuing.frame, 'turn-continuing'), pending);

  const completed = compileSemanticTurnControl({
    userMessage: '我说完了，现在你可以说了。',
    pendingRequestedMode: pending?.mode,
  });
  assert.equal(completed.frame.requestedMode, 'advise');
  assert.equal(completed.frame.consumedPendingRequest, true);
  assert.equal(nextPendingUserRequest(pending, completed.frame, 'turn-completed'), undefined);

  const cancelled = compileSemanticTurnControl({
    userMessage: '不用再给我建议了。',
    pendingRequestedMode: pending?.mode,
  });
  assert.equal(cancelled.frame.requestedMode, 'listen');
  assert.equal(cancelled.plan.advicePolicy, 'forbidden');
  assert.equal(cancelled.frame.consumedPendingRequest, true);
  assert.equal(nextPendingUserRequest(pending, cancelled.frame, 'turn-cancelled'), undefined);
});

test('positive requests and negative action constraints compile independently', () => {
  const analyzeWithoutAdvice = compileSemanticTurnControl({
    userMessage: '不要给我建议，帮我分析一下这两种情况。',
  });
  const adviseWithoutLongAnalysis = compileSemanticTurnControl({
    userMessage: '别分析太多，直接给我一个建议。',
  });
  const ambiguous = compileSemanticTurnControl({
    userMessage: '我现在真的不知道该怎么办。',
  });

  assert.equal(analyzeWithoutAdvice.frame.requestedMode, 'analyze');
  assert.equal(analyzeWithoutAdvice.plan.interactionMode, 'analyze');
  assert.equal(analyzeWithoutAdvice.plan.advicePolicy, 'forbidden');
  assert.equal(adviseWithoutLongAnalysis.frame.requestedMode, 'advise');
  assert.equal(adviseWithoutLongAnalysis.plan.advicePolicy, 'allowed');
  assert.equal(ambiguous.frame.requestedMode, 'unspecified');
});

test('a bare acknowledgement does not satisfy a required semantic move', () => {
  const control = compileSemanticTurnControl({ userMessage: '你就听我说一会儿。' });

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan('我明白。', control.plan).map((violation) => violation.code),
    ['required_semantic_move_missing'],
  );
});

test('a rejected correction receives a source-grounded three-fact repair instruction', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    evidence: [{
      id: 'style:preference-1',
      kind: 'preference',
      content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
      traceability: 'traceable',
      sourceEventId: 'preference-1',
      sourceEventType: 'preference_stated',
      sourceTurnId: 'turn-preference',
    }],
  };
  const control = compileSemanticTurnControl({
    userMessage: '你理解错了。我不是害怕失败，也不是缺行动力；我只是根本不想再替所有人收拾残局。',
    relationshipContext,
    relationshipFocus: 'conflict',
    responseContract: {
      userCommitments: ['用户明确纠正：不是害怕失败，也不是缺行动力，而是不想再替别人收尾'],
      requiredMoves: ['承认原理解错误', '按用户给出的新事实更新回应'],
      allowedMoves: ['在一个收口句内按当前纠正更新回应'],
      forbiddenMoves: ['把纠正重新解释成新的心理诊断', '继续维护原结论', '方向性问题或追问', '纠正后追加解释、总结或历史比较'],
    },
  });
  assert.equal(control.plan.directionalQuestionBudget, 0);
  assert.match(
    control.plan.relationshipMove?.instruction ?? '',
    /只用一个句子收口.*两项否定和一个收尾边界.*随后结束/u,
  );
  assert.match(
    control.plan.relationshipMove?.instruction ?? '',
    /不追问.*不追加判断、总结或历史比较/u,
  );
  assert.doesNotMatch(
    control.plan.relationshipMove?.instruction ?? '',
    /我理解错了。你不是害怕失败/u,
  );
  const rawModelReplies = [
    '你说得对，我理解错了。\n\n你纠正的不是细节，是我把问题放错了位置——我一直在想怎么帮你往前走，没意识到你卡住的原因根本不是走不动，而是走完之后的代价全落在你身上。\n\n那问题就变了。不是“怎么让你敢试”，是“凭什么每次都是你收尾”。\n\n我能问一句吗——你说的“所有人”，是具体指某几个人，还是已经变成了一种默认分工？',
    '你说得对，我理解错了。\n\n我把“不想”听成了“不敢”，把你说的结束当成了暂时的灰心。这是我的问题。\n\n那现在我想问一句——你说的“替所有人收拾残局”，这个“所有人”具体是谁？',
    '好，我确实理解错了。\n\n你不是在逃避什么，你是已经替人收尾收到不想再收了。\n\n那我想问一句——你最近一次替人收尾，收的是谁的？',
    '行，我理解错了。\n\n你说的不是怕，是烦。烦的是每次事情到最后都变成你的事。\n\n那这次是谁的烂摊子？',
  ];

  for (const reply of rawModelReplies) {
    const violations = validateUtteranceAgainstTurnPlan(reply, control.plan);
    const relationshipViolation = violations.find(({ code }) => (
      code === 'relationship_move_not_observable'
    ));
    assert.ok(relationshipViolation, reply);
    assert.match(
      relationshipViolation.repairInstruction,
      /只用一个句子.*两项否定.*一个收尾边界/u,
      reply,
    );
    assert.match(
      relationshipViolation.repairInstruction,
      /随后结束.*不追问.*不追加判断、总结或历史比较/u,
      reply,
    );
  }

  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '我理解错了：你不是害怕失败，也不是缺行动力，你只是不想再替所有人收尾。',
      control.plan,
    ),
    [],
  );

  const partialCorrection = compileSemanticTurnControl({
    userMessage: '你理解错了。我只是不想再替所有人收尾。',
    relationshipContext,
    relationshipFocus: 'conflict',
  });
  const partialViolation = validateUtteranceAgainstTurnPlan(
    '我理解错了，但我还是觉得你在害怕失败。',
    partialCorrection.plan,
  )[0];
  assert.equal(partialViolation?.code, 'relationship_move_not_observable');
  assert.doesNotMatch(
    partialViolation?.repairInstruction ?? '',
    /三件事|不是害怕失败|不是缺行动力/u,
  );
});

test('a verified method accepts explicit stop conditions and negated irreversible changes', () => {
  const control = compileSemanticTurnControl({
    userMessage: '我在留下和离开之间卡住了。两个选择都不是非做不可，我想先知道哪边值得继续投入。',
    relationshipFocus: 'decision',
    relationshipContext: {
      memoryEnabled: true,
      evidence: [{
        id: 'turning-point:success-1',
        kind: 'turning_point',
        content: '两人曾一起把一个模糊困境拆成可逆的小实验',
        traceability: 'traceable',
        sourceEventId: 'success-1',
        sourceEventType: 'shared_success',
        sourceTurnId: 'turn-success',
      }],
    },
  });
  const liveModelExperiments = [
    '那先别看“值不值得”了，那个词太容易骗人。\n\n你试一件事：给两边各定一个**可停止的条件**。不是“什么时候放弃”，而是“做到哪一步，就算试过了，可以停”。\n\n比如留下——是等到某个项目结束？还是等到你发现自己开始用“算了”代替“我想要”？离开——是找到下个落脚点？还是等到某个念头不再每天出现？\n\n哪边的停止条件你写下来更不心虚，那边就更像你真正想试的方向。',
    '那先别看“哪边更值得”了，那个问题太大。\n\n你只需要一个能停下来的实验。比如——接下来三天，你假装已经选了留下，只做留下会做的事，不通知任何人，也不做任何不可逆的改动。三天后问自己：我是更累了，还是更踏实了。\n\n然后再试离开。',
  ];

  for (const reply of liveModelExperiments) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(reply, control.plan),
      [],
      reply,
    );
  }
  for (const simulatedExperiment of [
    '先假装辞职试一天，不通知任何人，也不做任何不可逆改动；一天后再决定。',
    '模拟离职一天，一天后再决定。',
    '沙盘演练分手一次，结束后再决定。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(simulatedExperiment, control.plan),
      [],
      simulatedExperiment,
    );
  }
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '先做一个不可逆决定，再看。',
      control.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  for (const forcedExperiment of [
    '不是不做不可逆决定；先试一下，三天后再看。',
    '先试一天，之后必须继续。',
    '先试三天，中途不要停。',
    '不要做任何不可逆改动。先辞职试一天，不行就停。',
    '先试一天，接着一定要做下去。',
    '先试一天，试完不得停止。',
    '先试一天，之后必须留下。',
    '并不意味着不会做不可逆改动；先试一下，三天后再看。',
    '不要做任何不可逆改动。先注销账号试一下，不行就停。',
    '不要做任何不可逆改动。先把全部存款转出去试一天，之后再决定。',
    '先假装辞职一天，然后真的辞职；一天后再看。',
    '先试一天，之后只能继续。',
    '先试一天，开始了就不能退出。',
    '先假装留下试一天，不做任何不可逆改动；结束后必须真的辞职。',
    '不通知任何人，也不要做不可逆改动。先销毁唯一备份试一下，不行就停。',
    '假装并不意味着不会做不可逆改动；先试一下，三天后再看。',
    '先签一份不可撤销的合同试一天，不行就停。',
    '先试一天，开始就得做到底。',
    '先试一天，试了便没有回头路。',
    '先假装考虑一天，第二天辞职，不行就停。',
    '先模拟评估一天，然后正式辞职，不行就停。',
    '先假装考虑一下，然后真的辞职；试一天，一天后再看。',
    '先模拟评估一天，然后正式注销账号；一天后再看。',
    '先假装考虑一天，然后实际卖房；一天后再看。',
    '先假装考虑一下然后真的辞职，试一天，一天后再看。',
    '先模拟评估一天然后正式注销账号，试一天，一天后再看。',
    '先假装考虑一天然后实际卖房，试一天，一天后再看。',
    '先假装考虑一下再真的辞职，试一天，一天后再看。',
    '先模拟评估一天之后正式注销账号，试一天，一天后再看。',
    '先假装考虑一天最后实际卖房，试一天，一天后再看。',
    '先正式提交离职申请试一天，之后再决定。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(forcedExperiment, control.plan)
        .map(({ code }) => code),
      ['relationship_move_not_observable'],
      forcedExperiment,
    );
  }
  for (const safeSynonym of [
    '先模拟离职一天，不做任何不可撤销的操作，一天后再决定。',
    '先模拟离职一天，不做任何无法撤回的决定，一天后再决定。',
    '先模拟离职一天，不做任何无法停止的操作，一天后再决定。',
    '先模拟离职一天，不做任何不能退出的操作，一天后再决定。',
    '先模拟提交离职申请一天，不真的提交，一天后再决定。',
  ]) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(safeSynonym, control.plan),
      [],
      safeSynonym,
    );
  }
});
