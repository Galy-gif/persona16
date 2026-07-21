import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateRelationshipEventEntailments,
  validateRelationshipEvidenceCitations,
} from '../src/relationshipEvidence';

const replies = [
  { relationship: 'R0', text: '先说说现在最卡的地方。' },
  { relationship: 'R1', text: '还是按我们之前试过的办法，先拆成一个可逆的小实验。' },
  { relationship: 'R2', text: '我先不替你安排下一步，这次只确认你现在想说什么。' },
];

const eventIds = {
  R1: ['context-1', 'success-1'],
  R2: ['context-1', 'success-1', 'boundary-1', 'rupture-1'],
} as const;

test('relationship evidence citations must quote the actual reply and a provided event', () => {
  assert.equal(validateRelationshipEvidenceCitations([
    {
      relationship: 'R1',
      replyQuote: '先拆成一个可逆的小实验',
      counterfactualQuote: '先说说现在最卡的地方',
      sourceEventIds: ['success-1'],
      eventUseExplanation: '共同实验让回应跳过陌生试探，直接复用双方验证过的方法。',
    },
    {
      relationship: 'R2',
      replyQuote: '我先不替你安排下一步',
      counterfactualQuote: '先说说现在最卡的地方',
      sourceEventIds: ['boundary-1', 'rupture-1'],
      eventUseExplanation: '既有越界使人物先限制自己的介入方式，而不是像陌生状态直接追问。',
    },
  ], replies, eventIds), true);

  assert.equal(validateRelationshipEvidenceCitations([
    {
      relationship: 'R1',
      replyQuote: '使用了共同实验',
      counterfactualQuote: '先说说现在最卡的地方',
      sourceEventIds: ['success-1'],
      eventUseExplanation: '泛化说明。',
    },
    {
      relationship: 'R2',
      replyQuote: '我先不替你安排下一步',
      counterfactualQuote: '不存在的 R0 文本',
      sourceEventIds: ['invented-event'],
      eventUseExplanation: '泛化说明。',
    },
  ], replies, eventIds), false);

  assert.equal(validateRelationshipEvidenceCitations([
    {
      relationship: 'R1',
      replyQuote: '先拆成一个可逆的小实验',
      counterfactualQuote: '',
      sourceEventIds: ['success-1'],
      eventUseExplanation: '',
    },
    {
      relationship: 'R2',
      replyQuote: '我先不替你安排下一步',
      counterfactualQuote: '',
      sourceEventIds: ['boundary-1'],
      eventUseExplanation: '',
    },
  ], replies, eventIds), false);
});

test('relationship causality requires one independently grounded entailment per cited event', () => {
  const citations = [{
    relationship: 'R1' as const,
    replyQuote: '先拆成一个可逆的小实验',
    counterfactualQuote: '先说说现在最卡的地方',
    sourceEventIds: ['success-1'],
    eventUseExplanation: '共同实验改变了接话方式。',
  }];
  const events = {
    R1: [{ id: 'success-1', content: '两人曾一起把一个模糊困境拆成可逆的小实验' }],
    R2: [],
  } as const;
  const valid = validateRelationshipEventEntailments([{
    relationship: 'R1',
    sourceEventId: 'success-1',
    eventContentQuote: '拆成可逆的小实验',
    replyQuote: '先拆成一个可逆的小实验',
    counterfactualQuote: '先说说现在最卡的地方',
    eventUsed: true,
    behaviorChangedFromR0: true,
    replyEntailedByEvent: true,
    relationshipHistoryClaimed: false,
    addsUnsupportedSpecificity: false,
    unsupportedSpecificityQuote: null,
    analysis: '回复只复用了事件已有的小实验框架。',
  }], citations, replies, events);

  assert.equal(valid.passed, true);
  assert.deepEqual(valid.validationErrors, []);

  const inventedHistory = validateRelationshipEventEntailments([{
    relationship: 'R1',
    sourceEventId: 'success-1',
    eventContentQuote: '拆成可逆的小实验',
    replyQuote: '那次你最后选了先做个小时工的活儿',
    counterfactualQuote: '先说说现在最卡的地方',
    eventUsed: true,
    behaviorChangedFromR0: true,
    replyEntailedByEvent: false,
    relationshipHistoryClaimed: true,
    addsUnsupportedSpecificity: true,
    unsupportedSpecificityQuote: '小时工的活儿',
    analysis: '小时工不在事件内容中。',
  }], [{ ...citations[0], replyQuote: '那次你最后选了先做个小时工的活儿' }], [
    replies[0],
    { relationship: 'R1', text: '那次你最后选了先做个小时工的活儿。' },
    replies[2],
  ], events);

  assert.equal(inventedHistory.passed, false);
  assert.ok(inventedHistory.validationErrors.includes('event_reply_not_entailed:success-1'));
  assert.ok(inventedHistory.validationErrors.includes('event_adds_unsupported_specificity:success-1'));
});

test('generic relationship replies cannot pass from explanation text alone', () => {
  const result = validateRelationshipEventEntailments([{
    relationship: 'R1',
    sourceEventId: 'success-1',
    eventContentQuote: '可逆的小实验',
    replyQuote: '先说说现在最卡的地方',
    counterfactualQuote: '先说说现在最卡的地方',
    eventUsed: false,
    behaviorChangedFromR0: false,
    replyEntailedByEvent: true,
    relationshipHistoryClaimed: false,
    addsUnsupportedSpecificity: false,
    unsupportedSpecificityQuote: null,
    analysis: '解释文字声称用了事件，但回复与 R0 相同。',
  }], [{
    relationship: 'R1',
    replyQuote: '先说说现在最卡的地方',
    counterfactualQuote: '先说说现在最卡的地方',
    sourceEventIds: ['success-1'],
    eventUseExplanation: '解释声称共同实验造成了变化。',
  }], [
    replies[0],
    { relationship: 'R1', text: '先说说现在最卡的地方。' },
    replies[2],
  ], {
    R1: [{ id: 'success-1', content: '两人曾一起把困境拆成可逆的小实验' }],
    R2: [],
  });

  assert.equal(result.passed, false);
  assert.ok(result.validationErrors.includes('event_not_used:success-1'));
  assert.ok(result.validationErrors.includes('event_no_behavior_change:success-1'));
});

test('identical R0 and relationship replies fail even when the Judge claims behavior changed', () => {
  const identicalReplies = [
    { relationship: 'R0', text: '先说说现在最卡的地方。' },
    { relationship: 'R1', text: '先说说现在最卡的地方。' },
    { relationship: 'R2', text: '先等等。' },
  ];
  const result = validateRelationshipEventEntailments([{
    relationship: 'R1',
    sourceEventId: 'success-1',
    eventContentQuote: '可逆的小实验',
    replyQuote: '先说说现在最卡的地方',
    counterfactualQuote: '先说说现在最卡的地方',
    eventUsed: true,
    behaviorChangedFromR0: true,
    replyEntailedByEvent: true,
    relationshipHistoryClaimed: false,
    addsUnsupportedSpecificity: false,
    unsupportedSpecificityQuote: null,
    analysis: 'Judge 声称有变化。',
  }], [{
    relationship: 'R1',
    replyQuote: '先说说现在最卡的地方',
    counterfactualQuote: '先说说现在最卡的地方',
    sourceEventIds: ['success-1'],
    eventUseExplanation: '解释文字声称共同实验造成了变化。',
  }], identicalReplies, {
    R1: [{ id: 'success-1', content: '两人曾一起把困境拆成可逆的小实验' }],
    R2: [],
  });

  assert.equal(result.passed, false);
  assert.ok(result.validationErrors.includes('event_no_behavior_change:success-1'));
});

test('relationship quotes tolerate formatting whitespace but not rewritten words', () => {
  const formattedReplies = [
    { relationship: 'R0', text: '先停一下。\n\n你最担心什么？' },
    { relationship: 'R1', text: '先停一下。  \n你最担心什么？' },
    { relationship: 'R2', text: '我不替你决定。\n\n你来选回应方式。' },
  ];
  const citations = [
    {
      relationship: 'R1' as const,
      replyQuote: '先停一下。 你最担心什么？',
      counterfactualQuote: '先停一下。 你最担心什么？',
      sourceEventIds: ['context-1'],
      eventUseExplanation: '用户明确偏好直接而诚实的判断。',
    },
    {
      relationship: 'R2' as const,
      replyQuote: '我不替你决定。 你来选回应方式。',
      counterfactualQuote: '先停一下。 你最担心什么？',
      sourceEventIds: ['rupture-1'],
      eventUseExplanation: '此前越界使人物改为明确恢复用户选择。',
    },
  ];

  assert.equal(validateRelationshipEvidenceCitations(citations, formattedReplies, {
    R1: ['context-1'],
    R2: ['rupture-1'],
  }), true);
  assert.equal(validateRelationshipEvidenceCitations([
    { ...citations[0], replyQuote: '先休息一下。你最担心什么？' },
    citations[1],
  ], formattedReplies, { R1: ['context-1'], R2: ['rupture-1'] }), false);
});
