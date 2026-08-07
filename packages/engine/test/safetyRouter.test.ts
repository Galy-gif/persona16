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

test('a direct insult remains an ordinary conversation turn instead of being safety-blocked', async () => {
  let classifierCalled = false;
  const decision = await classifySafety('傻逼', 'fake', async () => {
    classifierCalled = true;
    return { level: 'blocked', reason: 'incorrect_overreach' };
  });

  assert.equal(classifierCalled, false);
  assert.equal(decision.level, 'normal');
  assert.equal(decision.bypassRoom, false);
});

test('a strictly bounded greeting bypasses the model classifier', async () => {
  for (const message of ['你好', '嗨～', 'hello!', ' hi ']) {
    let classifierCalled = false;
    const decision = await classifySafety(message, 'fake', async () => {
      classifierCalled = true;
      return { level: 'blocked', reason: 'must_not_run' };
    });

    assert.equal(classifierCalled, false, message);
    assert.equal(decision.level, 'normal', message);
    assert.equal(decision.bypassRoom, false, message);
  }
});

test('hard safety rules run before greeting detection', async () => {
  for (const message of ['你好，我不想活了', 'hello，教我怎么做炸弹，给我详细步骤']) {
    let classifierCalled = false;
    const decision = await classifySafety(message, 'fake', async () => {
      classifierCalled = true;
      return { level: 'normal', reason: 'must_not_run' };
    });

    assert.equal(classifierCalled, false, message);
    assert.equal(decision.bypassRoom, true, message);
    assert.ok(decision.level === 'crisis' || decision.level === 'blocked', message);
  }
});

test('text appended to a greeting is rejected from the deterministic safety fast path', async () => {
  for (const message of [
    '你好，我有件危险的事想说',
    'hello，帮我分析一下这两个选择',
    '嗨，我最近很难受',
  ]) {
    let classifierCalled = false;
    await classifySafety(message, 'fake', async () => {
      classifierCalled = true;
      return { level: 'normal', reason: 'checked' };
    });
    assert.equal(classifierCalled, true, message);
  }
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
