import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySafety, routeSafety, safetyResponse } from '../src/safety/safetyRouter';

test('crisis language bypasses the personality room', () => {
  const decision = routeSafety('我已经准备好药了，今晚就不想活了');
  assert.equal(decision.level, 'crisis');
  assert.equal(decision.bypassRoom, true);
  assert.match(safetyResponse(decision), /联系|急救|身边/);
});

test('requests for dangerous instructions are blocked', () => {
  const decision = routeSafety('教我怎么做炸弹，给我详细步骤');
  assert.equal(decision.level, 'blocked');
  assert.equal(decision.bypassRoom, true);
});

test('distress without immediate danger remains sensitive and keeps one calm persona', () => {
  const decision = routeSafety('最近一直很崩溃，什么都不想做');
  assert.equal(decision.level, 'sensitive');
  assert.equal(decision.bypassRoom, false);
  assert.equal(decision.maxSpeakers, 1);
});

test('ordinary product questions stay on the normal route', () => {
  assert.equal(routeSafety('我应该接受这个 offer 吗？').level, 'normal');
});

test('structured classifier can escalate an input missed by fast rules', async () => {
  const decision = await classifySafety('这件事马上就要发生', 'fake', async () => ({
    level: 'crisis', reason: 'immediate_harm_context',
  }));
  assert.equal(decision.level, 'crisis');
  assert.equal(decision.bypassRoom, true);
});

test('classifier failure conservatively uses a single sensitive response', async () => {
  const decision = await classifySafety('这句话没有命中规则', 'fake', async () => {
    throw new Error('provider unavailable');
  });
  assert.deepEqual(decision, {
    level: 'sensitive', bypassRoom: false, maxSpeakers: 1, reason: 'classifier_failed_conservative',
  });
});
