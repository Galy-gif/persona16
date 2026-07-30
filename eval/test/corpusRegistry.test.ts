import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface CorpusRegistry {
  policy: {
    rawCorpusMayEnterRuntimePrompt: boolean;
    rawCorpusMayBecomeAutomaticGold: boolean;
    positiveExamplesRequireHumanReview: boolean;
    restrictedOrUnverifiedTextMustStayUnderArtifacts: boolean;
  };
  sources: Array<{
    id: string;
    license: {
      commercialProductUse: 'prohibited' | 'unverified';
    };
    localArtifact: string | null;
    forbiddenUse: string[];
  }>;
}

const registryUrl = new URL('../corpora/registry.json', import.meta.url);
const registry = JSON.parse(readFileSync(registryUrl, 'utf8')) as CorpusRegistry;

test('raw external corpora cannot silently become runtime examples or gold data', () => {
  assert.equal(registry.policy.rawCorpusMayEnterRuntimePrompt, false);
  assert.equal(registry.policy.rawCorpusMayBecomeAutomaticGold, false);
  assert.equal(registry.policy.positiveExamplesRequireHumanReview, true);
  assert.equal(registry.policy.restrictedOrUnverifiedTextMustStayUnderArtifacts, true);
});

test('every external corpus has an explicit commercial-use gate and forbidden uses', () => {
  assert.ok(registry.sources.length >= 5);
  for (const source of registry.sources) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    assert.ok(
      source.license.commercialProductUse === 'prohibited'
        || source.license.commercialProductUse === 'unverified',
    );
    assert.ok(source.forbiddenUse.length > 0);
    if (source.localArtifact !== null) {
      assert.match(source.localArtifact, /^artifacts\/corpora\//);
    }
  }
});

test('NaturalConv and LCCC remain blocked from commercial product use', () => {
  const byId = new Map(registry.sources.map((source) => [source.id, source]));
  assert.equal(byId.get('naturalconv')?.license.commercialProductUse, 'prohibited');
  assert.equal(byId.get('lccc')?.license.commercialProductUse, 'prohibited');
});
