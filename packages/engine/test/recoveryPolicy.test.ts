import assert from 'node:assert/strict';
import test from 'node:test';
import { decideRecoveryAction } from '../src';

test('recovery routing distinguishes retry, transform, refresh, and stop', () => {
  assert.equal(decideRecoveryAction({
    code: 'RATE_LIMITED', recoverable: true, outcome: 'known_failed',
  }), 'retry');
  assert.equal(decideRecoveryAction({
    code: 'runtime_max_tokens', recoverable: true, outcome: 'known_failed', stopReason: 'max_tokens',
  }), 'transform');
  assert.equal(decideRecoveryAction({
    code: 'DELIVERY_FAILED', recoverable: true, outcome: 'unknown',
  }), 'refresh');
  assert.equal(decideRecoveryAction({
    code: 'INVALID_REQUEST', recoverable: false, outcome: 'known_failed',
  }), 'stop');
  assert.equal(decideRecoveryAction({
    code: 'MODEL_BUDGET_EXHAUSTED', recoverable: false, outcome: 'known_failed',
  }), 'stop');
});

test('user cancellation always wins over a recoverable provider hint', () => {
  assert.equal(decideRecoveryAction({
    code: 'provider_error',
    recoverable: true,
    outcome: 'known_failed',
    userCancelled: true,
  }), 'stop');
});

test('unknown outcome refreshes before any retry decision', () => {
  assert.equal(decideRecoveryAction({
    code: 'NETWORK_ERROR',
    recoverable: false,
    outcome: 'unknown',
  }), 'refresh');
});
