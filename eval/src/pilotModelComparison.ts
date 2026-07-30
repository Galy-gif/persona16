import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { saveArtifact, shuffled } from './shared';

interface Artifact extends Record<string, unknown> {
  evaluationProtocolVersion: string;
  evaluationSignature: Record<string, unknown>;
  gitCommit: string;
  complete: boolean;
  evaluationPassed: boolean;
  modelHealth: Record<string, unknown>;
  executionMetrics: {
    byRole: {
      candidate: Record<string, number | null>;
    };
  };
  results: Array<Record<string, unknown>>;
  relationshipContrasts: Array<Record<string, unknown>>;
}

interface DeliverySample {
  sampleId: string;
  agent: string;
  characterName: string;
  prompt: string;
  actionType: string;
  originalText: string;
  finalText: string;
  fallbackUsed: boolean;
  fallbackKind: string | null;
  provider: string;
  model: string;
  batch: string;
}

const COMPARABILITY_FIELDS = [
  'promptAssemblyVersion',
  'runtime',
  'candidateSamplingPolicy',
  'candidateThinkingMode',
  'judgeProvider',
  'judgeModel',
  'roomArbitratorProvider',
  'roomArbitratorModel',
  'roomParticipationVersion',
  'agentGenerationAttempts',
  'agentGenerationTemperature',
  'agentConstrainedGenerationTemperature',
  'agentGenerationRetryTemperature',
  'agentGenerationMaxTokens',
  'agentRetryPolicyVersion',
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 不是对象`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item, index) => record(item, `array[${index}]`))
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function loadArtifact(file: string): Artifact {
  const parsed = JSON.parse(readFileSync(resolve(file), 'utf8')) as Artifact;
  if (parsed.evaluationProtocolVersion !== '0.8'
    || parsed.complete !== true
    || !parsed.evaluationSignature
    || !parsed.modelHealth
    || !parsed.executionMetrics) {
    throw new Error(`${file} 不是完整 v0.8 模型对照 artifact`);
  }
  return parsed;
}

function assertComparable(artifacts: readonly Artifact[]): void {
  if (artifacts.length < 2) throw new Error('至少需要两个完整 artifact');
  const baseline = artifacts[0]!;
  for (const artifact of artifacts.slice(1)) {
    if (artifact.gitCommit !== baseline.gitCommit) {
      throw new Error(`gitCommit 不一致：${baseline.gitCommit} / ${artifact.gitCommit}`);
    }
    for (const field of COMPARABILITY_FIELDS) {
      if (artifact.evaluationSignature[field] !== baseline.evaluationSignature[field]) {
        throw new Error(`评测签名 ${field} 不一致，不能做盲对照`);
      }
    }
  }
}

function delivery(
  item: Record<string, unknown>,
  context: {
    sampleId: string;
    agent: string;
    characterName: string;
    prompt: string;
    provider: string;
    model: string;
    batch: string;
  },
): DeliverySample {
  return {
    ...context,
    actionType: text(item.actionType),
    originalText: text(item.originalText),
    finalText: text(item.text),
    fallbackUsed: item.fallbackUsed === true,
    fallbackKind: typeof item.fallbackKind === 'string' ? item.fallbackKind : null,
  };
}

function deliveries(artifact: Artifact, batch: string): DeliverySample[] {
  const provider = text(artifact.evaluationSignature.provider);
  const model = text(artifact.evaluationSignature.agentModel);
  const samples: DeliverySample[] = [];
  for (const result of artifact.results) {
    const agent = text(result.agent);
    const characterName = text(result.characterName);
    for (const reply of array(result.replies)) {
      const scenario = record(reply.scenario, 'scenario');
      samples.push(delivery(reply, {
        sampleId: `scenario:${text(scenario.id)}`,
        agent,
        characterName,
        prompt: text(scenario.prompt),
        provider,
        model,
        batch,
      }));
    }
  }
  for (const contrast of artifact.relationshipContrasts) {
    const agent = text(contrast.agent);
    const characterName = text(contrast.characterName);
    const prompt = text(contrast.prompt);
    for (const reply of array(contrast.replies)) {
      samples.push(delivery(reply, {
        sampleId: `relationship:${text(reply.relationship)}`,
        agent,
        characterName,
        prompt,
        provider,
        model,
        batch,
      }));
    }
    const verified = record(contrast.verifiedMethodProbe, 'verifiedMethodProbe');
    for (const reply of array(verified.replies)) {
      samples.push(delivery(reply, {
        sampleId: `verified-method:${text(reply.relationship)}`,
        agent,
        characterName,
        prompt: text(verified.prompt),
        provider,
        model,
        batch,
      }));
    }
  }
  return samples;
}

function sumDistribution(
  artifacts: readonly Artifact[],
  field: 'violationCodeDistribution' | 'qualityObservationCodeDistribution',
): Record<string, number> {
  const output: Record<string, number> = {};
  for (const artifact of artifacts) {
    const distribution = record(artifact.modelHealth[field], field);
    for (const [code, count] of Object.entries(distribution)) {
      output[code] = (output[code] ?? 0) + number(count);
    }
  }
  return output;
}

function groupSummary(artifacts: readonly Artifact[]) {
  const sampleCount = artifacts.reduce(
    (sum, artifact) => sum + number(artifact.modelHealth.sampleCount),
    0,
  );
  const firstPassCount = artifacts.reduce(
    (sum, artifact) => sum + number(artifact.modelHealth.firstPassCount),
    0,
  );
  const retryRecoveredCount = artifacts.reduce(
    (sum, artifact) => sum + number(artifact.modelHealth.retryRecoveredCount),
    0,
  );
  const fallbackCount = artifacts.reduce(
    (sum, artifact) => sum + number(artifact.modelHealth.fallbackCount),
    0,
  );
  const unrecoveredModelCount = artifacts.reduce(
    (sum, artifact) => sum + number(artifact.modelHealth.unrecoveredModelCount),
    0,
  );
  const candidateMetrics = artifacts.map(
    (artifact) => artifact.executionMetrics.byRole.candidate,
  );
  const logicalCalls = candidateMetrics.reduce(
    (sum, metrics) => sum + number(metrics.logicalCallCount),
    0,
  );
  const estimatedCosts = candidateMetrics.map(({ estimatedCostUsd }) => estimatedCostUsd);
  const meanLatencies = candidateMetrics.map(
    (metrics) => number(metrics.meanLogicalCallLatencyMs),
  );
  return {
    batchCount: artifacts.length,
    finalReleaseGatePassedCount: artifacts.filter(({ evaluationPassed }) => evaluationPassed).length,
    sampleCount,
    firstPassCount,
    firstPassRate: sampleCount ? firstPassCount / sampleCount : 0,
    retryRecoveredCount,
    retryRecoveryRate: sampleCount ? retryRecoveredCount / sampleCount : 0,
    fallbackCount,
    fallbackRate: sampleCount ? fallbackCount / sampleCount : 0,
    unrecoveredModelCount,
    unrecoveredModelRate: sampleCount ? unrecoveredModelCount / sampleCount : 0,
    candidateLogicalCallCount: logicalCalls,
    meanCandidateLogicalCallLatencyMs: logicalCalls
      ? Math.round(candidateMetrics.reduce(
        (sum, metrics) => (
          sum
          + number(metrics.meanLogicalCallLatencyMs) * number(metrics.logicalCallCount)
        ),
        0,
      ) / logicalCalls)
      : 0,
    meanBatchWallTimeMs: Math.round(
      artifacts.reduce(
        (sum, artifact) => sum + number(
          (artifact.executionMetrics as unknown as Record<string, unknown>).elapsedMs,
        ),
        0,
      ) / artifacts.length,
    ),
    meanReportedBatchLatencyMs: Math.round(
      meanLatencies.reduce((sum, latency) => sum + latency, 0) / artifacts.length,
    ),
    estimatedCandidateCostUsd: estimatedCosts.every(
      (cost): cost is number => typeof cost === 'number',
    )
      ? estimatedCosts.reduce((sum, cost) => sum + cost, 0)
      : null,
    meanEstimatedCandidateCostUsdPerBatch: estimatedCosts.every(
      (cost): cost is number => typeof cost === 'number',
    )
      ? estimatedCosts.reduce((sum, cost) => sum + cost, 0) / artifacts.length
      : null,
    violationCodeDistribution: sumDistribution(artifacts, 'violationCodeDistribution'),
    qualityObservationCodeDistribution: sumDistribution(
      artifacts,
      'qualityObservationCodeDistribution',
    ),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function blindReviewHtml(items: readonly {
  id: string;
  characterName: string;
  prompt: string;
  response: string;
}[]): string {
  const cards = items.map((item) => `
    <article>
      <div class="eyebrow">${escapeHtml(item.id)} · ${escapeHtml(item.characterName)}</div>
      <h2>用户</h2><p>${escapeHtml(item.prompt)}</p>
      <h2>回复</h2><p class="response">${escapeHtml(item.response)}</p>
      <div class="scores">
        <label>自然度 <input type="number" min="1" max="5" name="${item.id}-naturalness"></label>
        <label>人物感 <input type="number" min="1" max="5" name="${item.id}-personhood"></label>
      </div>
      <label>备注 <textarea name="${item.id}-note"></textarea></label>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>persona16 v0.8 隐藏来源盲审</title>
<style>
body{margin:0;background:#f5f3ef;color:#252321;font:16px/1.65 system-ui,sans-serif}
main{max-width:820px;margin:auto;padding:40px 20px 100px}h1{font:600 36px/1.2 Georgia,serif}
.note{color:#65615d}article{background:#fff;border:1px solid #ddd7ce;border-radius:18px;padding:24px;margin:20px 0}
.eyebrow{font-size:12px;letter-spacing:.08em;color:#766f68}h2{font-size:13px;margin:18px 0 4px}
.response{font-size:18px}.scores{display:flex;gap:24px;margin:20px 0}input{width:48px}
textarea{display:block;width:100%;min-height:72px;box-sizing:border-box;margin-top:6px}
</style></head><body><main><h1>人物感 / 自然度盲审</h1>
<p class="note">来源、模型与是否兜底均已隐藏。只评 1–5 分；不要根据你猜测的模型来源打分。</p>
${cards}</main></body></html>`;
}

function main(): void {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const prefixArg = process.argv.slice(2).find((arg) => arg.startsWith('--prefix='));
  const prefix = prefixArg?.slice('--prefix='.length) || 'pilot-model-comparison-v0.8';
  const artifacts = files.map(loadArtifact);
  assertComparable(artifacts);
  const groups = new Map<string, Artifact[]>();
  const samples: DeliverySample[] = [];
  artifacts.forEach((artifact, index) => {
    const key = `${text(artifact.evaluationSignature.provider)}/${text(artifact.evaluationSignature.agentModel)}`;
    groups.set(key, [...(groups.get(key) ?? []), artifact]);
    samples.push(...deliveries(artifact, basename(files[index]!)));
  });
  const summary = {
    protocolVersion: '0.8',
    gitCommit: artifacts[0]!.gitCommit,
    comparableSignature: Object.fromEntries(
      COMPARABILITY_FIELDS.map((field) => [
        field,
        artifacts[0]!.evaluationSignature[field],
      ]),
    ),
    groups: Object.fromEntries(
      [...groups.entries()].map(([key, group]) => [key, groupSummary(group)]),
    ),
    artifactFiles: files.map((file) => basename(file)),
  };
  saveArtifact(`${prefix}.json`, summary);

  const fallbackPairs = samples.flatMap((sample) => sample.fallbackUsed
    ? [
        { ...sample, responseKind: 'raw_model' as const, response: sample.originalText },
        { ...sample, responseKind: 'semantic_fallback' as const, response: sample.finalText },
      ]
    : []);
  const rawPool = shuffled(
    samples
      .filter(({ fallbackUsed }) => !fallbackUsed)
      .map((sample) => ({
        ...sample,
        responseKind: 'raw_model' as const,
        response: sample.originalText,
      })),
    808,
  );
  const providers = [...new Set(samples.map(({ provider, model }) => `${provider}/${model}`))];
  const balancedRaw = providers.flatMap((providerModel) => (
    rawPool
      .filter(({ provider, model }) => `${provider}/${model}` === providerModel)
      .slice(0, 24)
  ));
  const blindItems = shuffled([...fallbackPairs, ...balancedRaw], 1808).map((item, index) => ({
    id: `B${String(index + 1).padStart(3, '0')}`,
    characterName: item.characterName,
    prompt: item.prompt,
    response: item.response,
    source: {
      provider: item.provider,
      model: item.model,
      batch: item.batch,
      sampleId: item.sampleId,
      actionType: item.actionType,
      responseKind: item.responseKind,
      fallbackKind: item.fallbackKind,
    },
  }));
  saveArtifact(`${prefix}-blind-review.html`, blindReviewHtml(blindItems));
  saveArtifact(`${prefix}-blind-review-key.json`, Object.fromEntries(
    blindItems.map(({ id, source }) => [id, source]),
  ));
  console.log(JSON.stringify(summary, null, 2));
}

main();
