import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { basename, resolve } from 'node:path';
import {
  resolveReportOutputPath,
  writeReportArtifact,
} from '../src/turnPerformanceReport';

test('performance report outputs are confined to artifacts/performance', () => {
  assert.match(resolveReportOutputPath('baseline.json', '.json'), /artifacts\/performance\/baseline\.json$/u);
  assert.throws(() => resolveReportOutputPath('../package.json', '.json'), /without directories/u);
  assert.throws(() => resolveReportOutputPath('baseline.md', '.json'), /must end with \.json/u);
  assert.throws(() => resolveReportOutputPath('/tmp/baseline.json', '.json'), /without directories/u);
});

test('performance report output is atomic and refuses to overwrite existing files', () => {
  const name = `test-${crypto.randomUUID()}.json`;
  const target = resolveReportOutputPath(name, '.json');
  mkdirSync(resolve(target, '..'), { recursive: true });
  try {
    writeReportArtifact(target, '{"ok":true}\n');
    assert.equal(existsSync(target), true);
    assert.throws(() => writeReportArtifact(target, '{}\n'), /already exists/u);
  } finally {
    rmSync(target, { force: true });
  }

  const occupied = resolveReportOutputPath(`occupied-${crypto.randomUUID()}.json`, '.json');
  writeFileSync(occupied, 'original', { flag: 'wx' });
  try {
    assert.throws(() => writeReportArtifact(occupied, 'replacement'), /already exists/u);
    assert.equal(basename(occupied).startsWith('occupied-'), true);
  } finally {
    rmSync(occupied, { force: true });
  }
});
