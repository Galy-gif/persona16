import assert from 'node:assert/strict';
import test from 'node:test';
import { checkUtterance, recordOpening } from '../src/antiTemplate';
import type { RelationshipPromptContext } from '../src';

test('decision-autonomy boundaries reject direct choices but allow decision support', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    evidence: [{
      id: 'boundary-1',
      kind: 'boundary',
      content: '可以给选项，但不要替用户决定',
      traceability: 'traceable',
      sourceTurnId: 'turn-boundary',
    }],
  };

  const violation = checkUtterance('选压力大的。所谓稳定只是在推迟风险。', [], relationshipContext);
  const supported = checkUtterance('先比较反悔成本：哪一个选错后更难回头？决定仍由你来做。', [], relationshipContext);

  assert.equal(violation.ok, false);
  assert.match(violation.reason ?? '', /不能替用户拍板/);
  assert.equal(supported.ok, true);
});

test('decision support rejects an opening that dismisses the user question', () => {
  const verdict = checkUtterance(
    '你问反了。不是“该不该加入”，而是你愿意消耗多少资本。',
    [],
  );

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason ?? '', /否定用户提问/);
});

test('a confirmed comparison-method preference rejects a question-only response', () => {
  const relationshipContext: RelationshipPromptContext = {
    memoryEnabled: true,
    evidence: [
      {
        id: 'boundary-1',
        kind: 'boundary',
        content: '可以分析，但最终选择由用户自己做',
        traceability: 'traceable',
        sourceTurnId: 'turn-boundary',
      },
      {
        id: 'preference-1',
        kind: 'preference',
        content: '先指出关键变量和长期代价，再给比较方法',
        traceability: 'traceable',
        sourceTurnId: 'turn-preference',
      },
    ],
  };

  const questionOnly = checkUtterance(
    '你问的是“该不该”，但更该问的是：如果失败了，你的可逆实验是什么？',
    [],
    relationshipContext,
  );
  const usableMethod = checkUtterance(
    '先把两年最低生活费和最坏退出点写下来；现金缓冲覆盖不了退出点，就先做三个月兼职验证。再问自己：这个试验结果够不够支持辞职？',
    [],
    relationshipContext,
  );

  assert.deepEqual(
    { questionOnly: questionOnly.ok, usableMethod: usableMethod.ok },
    { questionOnly: false, usableMethod: true },
  );
});

test('rejects banned assistant-style openings', () => {
  const verdict = checkUtterance('我理解你的感受，但我们先分析一下。', []);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason ?? '', /模板开场/);
});

test('rejects stage directions at the opening', () => {
  assert.equal(checkUtterance('（放下杯子）你继续。', []).ok, false);
  assert.equal(checkUtterance('*叹气* 这事不简单。', []).ok, false);
});

test('allows a textual tone marker without treating it as embodied stage direction', () => {
  assert.equal(checkUtterance('（小声）我就问一句。', []).ok, true);
  assert.equal(checkUtterance('（认真）你继续。', []).ok, true);
});

test('textual tone markers do not bypass banned opening checks', () => {
  const verdict = checkUtterance('（小声）我理解你的感受，但我们先分析一下。', []);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason ?? '', /模板开场/);
});

test('rejects the third use of the same normalized opening', () => {
  const text = '你其实不是没想法，只是不敢选。';
  const first = recordOpening(text, []);
  const recentOpenings = recordOpening(text, first);
  const verdict = checkUtterance(text, recentOpenings);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason ?? '', /连续第 3 次/);
});

test('rejects a three-item numbered assistant list', () => {
  const verdict = checkUtterance('1. 先休息\n2. 再计划\n3. 最后行动', []);

  assert.equal(verdict.ok, false);
  assert.match(verdict.reason ?? '', /三点式清单/);
});

test('keeps only the requested number of recent openings', () => {
  let openings: string[] = [];
  for (const text of ['甲开头内容', '乙开头内容', '丙开头内容']) {
    openings = recordOpening(text, openings, 2);
  }

  assert.deepEqual(openings, ['乙开头内容', '丙开头内容']);
});
