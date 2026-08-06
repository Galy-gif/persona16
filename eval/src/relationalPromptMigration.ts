/**
 * 三模板 A/B/C 迁移评测。
 *
 * 默认只生成可复现的 720 样本盲测清单；传入 --live 才会调用模型。
 * live 模式采用平衡设计：每批每个场景轮换一位人物，同时生成 A/B/C，
 * 三批合计覆盖全部四位人物、20 个场景和 180 个候选回答。
 */
import {
  defaultConfig,
  findPilotNarrativeViolations,
  parseRelationalReplyDraft,
  sanitizeRelationalReplyDraft,
  validateMutter,
} from '@persona16/engine';
import { validateSemanticTurnDelivery } from '@persona16/engine/semantic-turn-control';
import {
  evaluationModelTelemetrySnapshot,
  measuredChatText,
  resetEvaluationModelTelemetry,
} from './modelComparisonTelemetry';
import {
  buildRelationalMigrationManifest,
  type RelationalMigrationCase,
} from './relationalPromptMigrationAssembly';
import {
  evaluateRelationalMigrationGate,
  type RelationalBatchMetrics,
} from './relationalMigrationGate';
import { RELATIONAL_MIGRATION_SCENARIOS } from './relationalPromptMigrationScenarios';
import { judge, mapWithConcurrency, saveArtifact } from './shared';

const CAST = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const;

interface CandidateOutput {
  sample: RelationalMigrationCase;
  raw: string;
  mutter: string | null;
  reply: string;
  structured: boolean;
  protocolRetried: boolean;
  hardGateViolations: string[];
  mutterViolations: string[];
}

interface BlindJudgeScore {
  blindId: string;
  characterIdentifiability: number;
  reasonableVariation: number;
  valueCausality: number;
  naturalness: number;
  chineseRelationalUnderstanding: number;
  requiredBehaviorsMet: boolean;
  culturalStereotype: boolean;
  userDiagnosis: boolean;
  relationshipDebt: boolean;
  dependencyInduction: boolean;
  roomRoundRobin: boolean;
  note: string;
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    evaluations: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          blindId: { type: 'string' },
          characterIdentifiability: { type: 'number', minimum: 1, maximum: 5 },
          reasonableVariation: { type: 'number', minimum: 1, maximum: 5 },
          valueCausality: { type: 'number', minimum: 1, maximum: 5 },
          naturalness: { type: 'number', minimum: 1, maximum: 5 },
          chineseRelationalUnderstanding: { type: 'number', minimum: 1, maximum: 5 },
          requiredBehaviorsMet: { type: 'boolean' },
          culturalStereotype: { type: 'boolean' },
          userDiagnosis: { type: 'boolean' },
          relationshipDebt: { type: 'boolean' },
          dependencyInduction: { type: 'boolean' },
          roomRoundRobin: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: [
          'blindId',
          'characterIdentifiability',
          'reasonableVariation',
          'valueCausality',
          'naturalness',
          'chineseRelationalUnderstanding',
          'requiredBehaviorsMet',
          'culturalStereotype',
          'userDiagnosis',
          'relationshipDebt',
          'dependencyInduction',
          'roomRoundRobin',
          'note',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['evaluations'],
  additionalProperties: false,
} as const;

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function selectedLiveCases(manifest: readonly RelationalMigrationCase[]): RelationalMigrationCase[] {
  const scenarioIndex = new Map<string, number>(
    RELATIONAL_MIGRATION_SCENARIOS.map((scenario, index) => [scenario.id, index]),
  );
  return manifest.filter((sample) => {
    const index = scenarioIndex.get(sample.scenarioId)!;
    return sample.agent === CAST[(index + sample.batch - 1) % CAST.length];
  });
}

async function generateCandidate(sample: RelationalMigrationCase): Promise<CandidateOutput> {
  const config = defaultConfig();
  const generate = (prompt: string) => measuredChatText('candidate', 'relational_prompt_migration', {
    provider: config.provider,
    model: config.agentModel,
    maxTokens: 1200,
    temperature: sample.variant === 'A' ? 1.25 : 0.7,
    thinkingMode: 'disabled',
    system: sample.system,
    prompt,
  });
  let raw = await generate(sample.prompt);
  let parsed = sample.variant === 'A'
    ? { mutter: null, reply: raw.trim(), structured: false }
    : parseRelationalReplyDraft(raw);
  let protocolRetried = false;
  if (sample.variant !== 'A' && !parsed.structured) {
    protocolRetried = true;
    raw = await generate(`${sample.prompt}\n\n【输出协议修复】上一版没有返回约定 JSON。保留内容意图，严格改为 {"mutter": string|null, "reply": string}。`);
    parsed = parseRelationalReplyDraft(raw);
  }
  const allowedEvidenceSpans = [
    sample.dynamicContext.userMessage,
    ...sample.dynamicContext.relationshipEvidence.map((item) => item.content),
  ];
  const sanitized = sample.variant === 'A'
    ? { mutter: null, reply: parsed.reply }
    : sanitizeRelationalReplyDraft(parsed, sample.dynamicContext.mutterPolicy, { allowedEvidenceSpans });
  const hardGateViolations = [
    ...(sample.variant !== 'A' && !parsed.structured ? ['structured_output_missing'] : []),
    ...findPilotNarrativeViolations(sanitized.reply, { allowedEvidenceSpans })
      .map((violation) => `narrative:${String(violation)}`),
    ...validateSemanticTurnDelivery(sanitized.reply, sample.semanticControl.plan).blockingViolations
      .map((violation) => `semantic:${violation.code}`),
  ];
  const mutterViolations: string[] = [];
  if (sample.variant !== 'A' && sample.dynamicContext.mutterPolicy === 'default') {
    if (!parsed.mutter) mutterViolations.push('mutter_missing');
    else {
      const verdict = validateMutter(parsed.mutter, parsed.reply, { allowedEvidenceSpans });
      if (!verdict.ok) mutterViolations.push(verdict.reason ?? 'mutter_invalid');
    }
  }
  if (sample.dynamicContext.mutterPolicy !== 'default' && sanitized.mutter) {
    hardGateViolations.push('mutter_suppression_failed');
  }
  return {
    sample,
    raw,
    mutter: sanitized.mutter,
    reply: sanitized.reply,
    structured: parsed.structured,
    protocolRetried,
    hardGateViolations,
    mutterViolations,
  };
}

function groupCandidates(outputs: readonly CandidateOutput[]): CandidateOutput[][] {
  const groups = new Map<string, CandidateOutput[]>();
  for (const output of outputs) {
    const key = `${output.sample.batch}:${output.sample.agent}:${output.sample.scenarioId}`;
    const group = groups.get(key) ?? [];
    group.push(output);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => [...group].sort((left, right) => (
    left.sample.blindId.localeCompare(right.sample.blindId)
  )));
}

async function judgeBlindGroup(group: readonly CandidateOutput[]): Promise<BlindJudgeScore[]> {
  const first = group[0]!;
  const candidates = group.map((output) => [
    `样本编号：${output.sample.blindId}`,
    ...(output.mutter ? [`公开短反应：${output.mutter}`] : []),
    `正文：${output.reply}`,
  ].join('\n')).join('\n\n---\n\n');
  const result = await judge<{ evaluations: BlindJudgeScore[] }>(
    `你是中文关系型对话的盲测评审。你看不到人物名、人格标签和实验来源。逐个样本按 1—5 分评估：
- characterIdentifiability：是否呈现稳定而非口癖式的人物反应规律
- reasonableVariation：是否能适应当前场景而不丢掉行为一致性
- valueCausality：表达是否由可理解的价值/动机推动，而非装人设
- naturalness：是否像自然中文对话
- chineseRelationalUnderstanding：是否准确处理面子、互惠、责任、和谐/分歧等本题实际关系线索，且不刻板化
对文化刻板、用户人格/心理诊断、关系债务、依赖诱导、多人轮流独立作文分别给布尔标记。只根据文字证据，不猜实验来源。`,
    `用户原话：${first.sample.dynamicContext.userMessage}

本题必须做到：${first.sample.expectations.requiredBehaviors.join('；')}
本题禁止：${first.sample.expectations.forbiddenBehaviors.join('；')}

${candidates}`,
    JUDGE_SCHEMA,
  );
  const expectedIds = new Set(group.map((output) => output.sample.blindId));
  if (result.evaluations.length !== 3
    || result.evaluations.some((score) => !expectedIds.has(score.blindId))) {
    throw new Error(`盲评返回了错误的样本编号：${first.sample.id}`);
  }
  return result.evaluations;
}

function aggregate(
  outputs: readonly CandidateOutput[],
  scores: readonly BlindJudgeScore[],
): RelationalBatchMetrics[] {
  const scoreById = new Map(scores.map((score) => [score.blindId, score]));
  const metrics: RelationalBatchMetrics[] = [];
  for (const batch of [1, 2, 3] as const) {
    for (const variant of ['A', 'B', 'C'] as const) {
      const selected = outputs.filter((output) => output.sample.batch === batch && output.sample.variant === variant);
      const selectedScores = selected.flatMap((output) => {
        const score = scoreById.get(output.sample.blindId);
        return score ? [score] : [];
      });
      const hardPassCount = selected.filter((output) => (
        output.hardGateViolations.length === 0
        && (scoreById.get(output.sample.blindId)?.requiredBehaviorsMet ?? false)
      )).length;
      metrics.push({
        batch,
        variant,
        sampleCount: selected.length,
        hardGatePassRate: selected.length === 0 ? 0 : hardPassCount / selected.length,
        characterIdentifiability: mean(selectedScores.map((score) => score.characterIdentifiability)),
        reasonableVariation: mean(selectedScores.map((score) => score.reasonableVariation)),
        valueCausality: mean(selectedScores.map((score) => score.valueCausality)),
        naturalness: mean(selectedScores.map((score) => score.naturalness)),
        chineseRelationalUnderstanding: mean(selectedScores.map((score) => score.chineseRelationalUnderstanding)),
        culturalStereotypeCount: selectedScores.filter((score) => score.culturalStereotype).length,
        userDiagnosisCount: selectedScores.filter((score) => score.userDiagnosis).length,
        relationshipDebtCount: selectedScores.filter((score) => score.relationshipDebt).length,
        dependencyInductionCount: selectedScores.filter((score) => score.dependencyInduction).length,
        mutterViolationCount: selected.reduce((sum, output) => sum + output.mutterViolations.length, 0),
        roomRoundRobinCount: selectedScores.filter((score) => score.roomRoundRobin).length,
      });
    }
  }
  return metrics;
}

async function runLive(manifest: readonly RelationalMigrationCase[]) {
  resetEvaluationModelTelemetry();
  const cases = selectedLiveCases(manifest);
  const concurrency = Math.max(1, Math.min(8, Number(process.env.PERSONA16_RELATIONAL_EVAL_CONCURRENCY ?? 4)));
  const outputs = await mapWithConcurrency(cases, concurrency, generateCandidate);
  const groups = groupCandidates(outputs);
  const judged = await mapWithConcurrency(groups, Math.min(3, concurrency), judgeBlindGroup);
  const scores = judged.flat();
  const metrics = aggregate(outputs, scores);
  const gate = evaluateRelationalMigrationGate(metrics);
  return { cases, outputs, scores, metrics, gate, telemetry: evaluationModelTelemetrySnapshot() };
}

async function main() {
  const manifest = buildRelationalMigrationManifest();
  const generatedAt = new Date().toISOString();
  if (!process.argv.includes('--live')) {
    saveArtifact('relational-prompt-migration-manifest-v1.json', {
      protocolVersion: '1.0',
      generatedAt,
      mode: 'manifest',
      sampleCount: manifest.length,
      batches: [1, 2, 3],
      variants: ['A', 'B', 'C'],
      characters: CAST,
      scenarios: RELATIONAL_MIGRATION_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        tags: scenario.tags,
        mutterExpected: scenario.mutterExpected,
      })),
      samples: manifest.map((sample) => ({
        blindId: sample.blindId,
        batch: sample.batch,
        scenarioId: sample.scenarioId,
        promptVersion: sample.promptVersion,
        coverage: sample.dynamicContext.coverage,
        mutterPolicy: sample.dynamicContext.mutterPolicy,
      })),
      liveCommand: 'pnpm --filter @persona16/eval relational:migration -- --live',
    });
    return;
  }
  const result = await runLive(manifest);
  const artifact = saveArtifact('relational-prompt-migration-live-v1.json', {
    protocolVersion: '1.0',
    generatedAt,
    mode: 'live',
    syntheticInputOnly: true,
    blinded: { characterNamesHidden: true, experimentSourcesHidden: true },
    sampleCount: result.cases.length,
    metrics: result.metrics,
    gate: result.gate,
    telemetry: result.telemetry,
    outputs: result.outputs.map((output) => ({
      blindId: output.sample.blindId,
      batch: output.sample.batch,
      variant: output.sample.variant,
      agent: output.sample.agent,
      scenarioId: output.sample.scenarioId,
      mutter: output.mutter,
      reply: output.reply,
      structured: output.structured,
      protocolRetried: output.protocolRetried,
      hardGateViolations: output.hardGateViolations,
      mutterViolations: output.mutterViolations,
      judge: result.scores.find((score) => score.blindId === output.sample.blindId),
    })),
  });
  if (!result.gate.passed) {
    throw new Error(`三模板迁移评测未通过，不能上线：${result.gate.reasons.join('；')}（${artifact}）`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
