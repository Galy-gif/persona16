import assert from 'node:assert/strict';
import test from 'node:test';
import { checkUtterance, recordOpening } from '../src/antiTemplate';

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
