import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  validateNaturalExpressionCorpus,
  type NaturalExpressionCorpus,
} from '../src/naturalExpressionCorpus';

const corpusUrl = new URL('../corpora/natural-expression-v0.1.json', import.meta.url);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as NaturalExpressionCorpus;
const registry = JSON.parse(readFileSync(new URL('../corpora/registry.json', import.meta.url), 'utf8')) as {
  sources: Array<{ id: string }>;
};

test('the proprietary natural-expression corpus passes its intake gate', () => {
  const result = validateNaturalExpressionCorpus(corpus);

  assert.equal(result.passed, true, result.errors.join('\n'));
  assert.equal(result.errors.length, 0);
  assert.ok(corpus.dimensions.length >= 8);
  assert.ok(corpus.cases.length >= 12);
});

test('every contrast context shows more than one natural realization', () => {
  const byContext = new Map<string, typeof corpus.cases>();
  for (const sample of corpus.cases) {
    byContext.set(sample.contextId, [...(byContext.get(sample.contextId) ?? []), sample]);
  }

  for (const [contextId, samples] of byContext) {
    assert.ok(samples.length >= 2, `${contextId} needs a contrast pair`);
    assert.ok(new Set(samples.map((sample) => JSON.stringify(sample.tendencies))).size >= 2);
  }
});

test('candidate replies are original, plural, and never automatic gold', () => {
  assert.equal(corpus.provenance.textOrigin, 'persona16-original');
  assert.equal(corpus.provenance.externalTextCopied, false);
  assert.equal(corpus.policy.candidateRepliesAreAutomaticGold, false);
  assert.equal(corpus.policy.approvedGoldRequiresHumanReview, true);

  for (const sample of corpus.cases) {
    assert.equal(sample.reviewStatus, 'candidate');
    assert.ok(sample.acceptableReplies.length >= 2);
    assert.ok(sample.antiExamples.length >= 1);
    assert.ok(sample.visibleEvidence.length <= 2);
  }
});

test('every evidence source is present in the licensed corpus registry', () => {
  const registered = new Set(registry.sources.map(({ id }) => id));
  for (const source of corpus.sourceRoles) {
    assert.ok(registered.has(source.sourceId), `${source.sourceId} is missing from registry.json`);
  }
});

test('intake rejects copied text, style-pack overacting, and unreviewed gold', () => {
  const invalid = structuredClone(corpus);
  invalid.provenance.externalTextCopied = true;
  invalid.policy.candidateRepliesAreAutomaticGold = true;
  invalid.cases[0]!.visibleEvidence = [
    'initiative',
    'playfulness',
    'warmth',
  ];
  invalid.cases[0]!.acceptableReplies = ['我是那种很内向、很幽默、说话很直接的人。'];

  const result = validateNaturalExpressionCorpus(invalid);

  assert.equal(result.passed, false);
  assert.ok(result.errors.some((error) => error.includes('external text')));
  assert.ok(result.errors.some((error) => error.includes('automatic gold')));
  assert.ok(result.errors.some((error) => error.includes('visibility budget')));
  assert.ok(result.errors.some((error) => error.includes('self-label')));
});
