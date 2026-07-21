import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRelationshipEvidenceCitations } from '../src/relationshipEvidence';

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
