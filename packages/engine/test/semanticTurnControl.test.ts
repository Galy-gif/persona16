import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileSemanticTurnControl,
  nextPendingUserRequest,
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
    ['decision_reopened'],
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
    ['forbidden_advice', 'decision_reopened'],
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
    ['required_semantic_move_missing'],
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
  for (const explicitSelfAcknowledgement of ['我越界了', '这次是我越界了', '刚才是我越界了']) {
    assert.deepEqual(
      validateUtteranceAgainstTurnPlan(
        `${explicitSelfAcknowledgement}。我先停。`,
        control.plan,
      ),
      [],
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
      '说实话，我不确定你现在该停，但听起来继续硬撑也未必是在前进。',
      support.plan,
    ),
    [],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '不觉得你活该。事情全发生了，不代表你就该听我的。',
      support.plan,
    ),
    [],
  );
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
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '说实话，会过去的。',
      support.plan,
    ).map(({ code }) => code),
    ['relationship_move_not_observable'],
  );
  assert.deepEqual(
    validateUtteranceAgainstTurnPlan(
      '先试一天，而且随时可以停，再用这一天的信息决定要不要继续。',
      decision.plan,
    ),
    [],
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
    ['forbidden_advice'],
  );
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
