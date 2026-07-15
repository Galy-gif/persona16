import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTracer } from '../src/trace';

test('trace initialization failure is reported without becoming a conversation failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'persona16-trace-'));
  const blockingFile = join(directory, 'not-a-directory');
  writeFileSync(blockingFile, 'occupied');
  const failures: string[] = [];

  try {
    const tracer = createTracer(join(blockingFile, 'trace.ndjson'), (failure) => {
      failures.push(failure.operation);
    });
    assert.doesNotThrow(() => tracer.emit('turn_done', { ok: true }));
    assert.deepEqual(failures, ['initialize']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('trace write failure disables the tracer after one isolated report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'persona16-trace-'));
  const failures: string[] = [];
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  try {
    const tracer = createTracer(join(directory, 'trace.ndjson'), (failure) => {
      failures.push(failure.operation);
    });
    assert.doesNotThrow(() => tracer.emit('circular', circular));
    assert.doesNotThrow(() => tracer.emit('ignored_after_failure', { ok: true }));
    assert.deepEqual(failures, ['write']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
